'use client';
import type { Place, PlaceCandidate } from '@mappin/api-client';
import type { MapHandle, MarkerSpec } from '@mappin/map-core';
import { LocateFixed, Minus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import Supercluster from 'supercluster';
import { useAuth } from '@/lib/auth';
import { iconSvg } from '@/lib/icons';
import { useCategories, useInbox, useMapConfig, usePlace, usePlaces, useTags } from '@/lib/queries';
import { useMediaQuery, useTheme } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { AccountMenu } from './AccountMenu';
import { CategoryManager } from './CategoryManager';
import { MapView } from './MapView';
import { PlaceDetail } from './PlaceDetail';
import { PlaceForm, type Draft } from './PlaceForm';
import { PlaceList } from './PlaceList';
import { GeoResults } from './SearchResults';
import { ShareDialog, SharesPanel, type ShareTarget } from './Sharing';

type View = { type: 'list' } | { type: 'detail'; id: string } | { type: 'create'; draft: Draft } | { type: 'edit'; id: string };
type Tab = 'places' | 'categories' | 'shares';
type Snap = 'peek' | 'half' | 'full';
const SNAP_PX = (s: Snap) => (s === 'peek' ? 112 : s === 'half' ? Math.round(window.innerHeight * 0.46) : Math.round(window.innerHeight * 0.92));

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function MapApp() {
  const { me } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const isMobile = useMediaQuery('(max-width: 899px)');
  const { data: config } = useMapConfig();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const { data: inbox = [] } = useInbox();

  const [tab, setTab] = useState<Tab>('places');
  const [view, setView] = useState<View>({ type: 'list' });
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 250);
  const [hiddenLayers, setHidden] = useState<Set<string>>(new Set());
  const [hoverId, setHover] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [previewIcon, setPreviewIcon] = useState<{ key: string; color: string } | null>(null);
  const [cam, setCam] = useState<{ bbox: [number, number, number, number]; zoom: number } | null>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const [dragH, setDragH] = useState<number | null>(null);
  const handle = useRef<MapHandle | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ y: number; h: number; t: number } | null>(null);

  const { data: places, isLoading } = usePlaces({ categoryId, tagIds, q: q || undefined, scope: 'all' });
  const editing = usePlace(view.type === 'edit' ? view.id : null).data;
  const visible = useMemo(() => (places ?? []).filter((p) => !p.via_share_id || !hiddenLayers.has(p.via_share_id)), [places, hiddenLayers]);
  const pendingShares = inbox.filter((s) => s.status === 'pending').length;

  // ── 클러스터링 (클라이언트, supercluster) ──
  const index = useMemo(() => {
    const sc = new Supercluster<{ i: number }>({ radius: 56, maxZoom: 17 });
    sc.load(visible.map((p, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: { i } })));
    return sc;
  }, [visible]);

  const selectedId = view.type === 'detail' ? view.id : null;
  const placing = view.type === 'create' || view.type === 'edit';
  const markers = useMemo<MarkerSpec[]>(() => {
    if (!cam) return [];
    const [w, s, e, n] = cam.bbox;
    const pad = (e - w) * 0.1;
    return index.getClusters([w - pad, s - pad, e + pad, n + pad], Math.floor(cam.zoom)).flatMap((f): MarkerSpec[] => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const props = f.properties as any;
      if (props.cluster) return [{ kind: 'cluster', id: `c:${props.cluster_id}`, position: { lat, lng }, count: props.point_count }];
      const p = visible[props.i]!;
      if (view.type === 'edit' && view.id === p.id) return [];
      return [
        {
          kind: 'place',
          id: p.id,
          position: { lat, lng },
          icon: p.icon,
          title: p.title,
          selected: p.id === selectedId || p.id === hoverId,
          badge: p.via_share_id ? { type: 'shared', label: inbox.find((s) => s.id === p.via_share_id)?.owner?.display_name ?? '공유' } : undefined,
        },
      ];
    });
  }, [cam, index, visible, selectedId, hoverId, view, inbox]);

  // ── 화면 전환 ──
  const fly = (loc: { lat: number; lng: number }, minZoom = 15) =>
    handle.current?.setCamera({ center: loc, zoom: Math.max(handle.current.getCamera().zoom, minZoom) });
  const openDetail = useCallback((id: string) => {
    setView({ type: 'detail', id });
    setTab('places');
    if (isMobile) setSnap('half');
  }, [isMobile]);
  const startCreate = useCallback(
    (draft: Draft = {}) => {
      setView({ type: 'create', draft });
      setTab('places');
      if (draft.location) fly(draft.location, 16);
      if (isMobile) setSnap('half');
    },
    [isMobile],
  );
  const back = useCallback(() => setView((v) => (v.type === 'edit' ? { type: 'detail', id: v.id } : { type: 'list' })), []);
  const pickCandidate = (c: PlaceCandidate) => {
    setQuery('');
    startCreate({
      title: c.name,
      location: c.location,
      icon_key: c.suggested_icon_key,
      provider_ref: c.provider_ref,
      source: 'search',
      address: c.address,
    });
  };

  // ── 키보드 ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !document.querySelector('.scrim')) {
        if (typing) (e.target as HTMLElement).blur();
        else back();
      } else if (!typing && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        startCreate();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [back, startCreate]);

  const locate = () => {
    if (!navigator.geolocation) return toast('이 브라우저는 위치를 지원하지 않아요');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        handle.current?.setUserLocation(p, pos.coords.accuracy);
        fly(p, 15);
      },
      () => toast('위치 권한을 허용해 주세요'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // 편집 시작 시 장소 위치로 이동
  useEffect(() => {
    if (view.type === 'edit' && editing) fly(editing.location, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.type === 'edit' && editing?.id]);

  if (!config) return <div className="app" style={{ background: 'var(--bg)' }} />;

  const filtered = !!(categoryId || tagIds.length || q);
  const getLocation = () => handle.current!.getCamera().center;

  const body = (() => {
    if (view.type === 'create')
      return (
        <PlaceForm
          key={JSON.stringify(view.draft)}
          mode="create"
          draft={view.draft}
          defaultCategoryId={categoryId}
          getLocation={getLocation}
          onCancel={back}
          onSaved={(p: Place) => openDetail(p.id)}
          onPreview={setPreviewIcon}
        />
      );
    if (view.type === 'edit')
      return editing ? <PlaceForm mode="edit" place={editing} getLocation={getLocation} onCancel={back} onSaved={(p) => openDetail(p.id)} onPreview={setPreviewIcon} /> : null;
    if (view.type === 'detail')
      return (
        <PlaceDetail
          id={view.id}
          onBack={back}
          onEdit={(p) => setView({ type: 'edit', id: p.id })}
          onShare={(p) => setShareTarget({ type: 'place', id: p.id, title: p.title })}
          onFocus={(p) => fly(p.location, 16)}
          onDeleted={() => setView({ type: 'list' })}
        />
      );
    if (tab === 'categories')
      return (
        <CategoryManager
          onShare={(c) => setShareTarget({ type: 'category', id: c.id, title: c.name })}
          onPick={(c) => (setCategoryId(c.id), setTab('places'))}
        />
      );
    if (tab === 'shares')
      return (
        <SharesPanel
          hidden={hiddenLayers}
          onToggleLayer={(id) =>
            setHidden((h) => {
              const n = new Set(h);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            })
          }
        />
      );
    return (
      <>
        <PlaceList
          places={visible}
          loading={isLoading}
          categories={categories}
          tags={tags}
          categoryId={categoryId}
          tagIds={tagIds}
          filtered={filtered}
          hoverId={hoverId}
          onCategory={setCategoryId}
          onToggleTag={(id) => setTagIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))}
          onOpen={(id) => {
            openDetail(id);
            const p = visible.find((x) => x.id === id);
            if (p) fly(p, 14);
          }}
          onHover={setHover}
          onNew={() => startCreate()}
        />
        {q && <GeoResults q={q} near={cam ? handle.current?.getCamera().center ?? null : null} onPick={pickCandidate} onOpenSaved={openDetail} />}
      </>
    );
  })();

  const searchBar = (floating: boolean) => (
    <label className={`search ${floating ? 'floating' : ''}`}>
      <Search size={18} className="faint" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (view.type !== 'list') setView({ type: 'list' });
          setTab('places');
          if (isMobile && snap === 'peek') setSnap('half');
        }}
        placeholder="내 장소, 메모, 태그 또는 새 장소 검색"
        aria-label="검색"
      />
      {query ? (
        <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setQuery('')} aria-label="검색어 지우기">
          <X size={16} />
        </button>
      ) : (
        !isMobile && <span className="kbd">⌘K</span>
      )}
    </label>
  );

  const tabs = view.type === 'list' && (
    <div className="tabs" role="tablist">
      {(
        [
          ['places', '장소', visible.length],
          ['categories', '카테고리', null],
          ['shares', '공유', pendingShares || null],
        ] as const
      ).map(([k, label, count]) => (
        <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
          {label}
          {count ? <span className={`count num ${k === 'shares' ? 'badge' : ''}`} style={k === 'shares' ? { background: 'var(--accent)', color: '#fff' } : undefined}>{count}</span> : null}
        </button>
      ))}
    </div>
  );

  // ── 바텀시트 드래그 ──
  const onDown = (e: RPointerEvent) => {
    drag.current = { y: e.clientY, h: SNAP_PX(snap), t: performance.now() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => drag.current && setDragH(Math.max(80, Math.min(window.innerHeight * 0.94, drag.current.h + drag.current.y - e.clientY)));
  const onUp = (e: RPointerEvent) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const v = dy / Math.max(1, performance.now() - drag.current.t);
    const h = drag.current.h + dy;
    drag.current = null;
    setDragH(null);
    const order: Snap[] = ['peek', 'half', 'full'];
    if (Math.abs(v) > 0.5) return setSnap(order[Math.max(0, Math.min(2, order.indexOf(snap) + (v > 0 ? 1 : -1)))]!);
    setSnap(order.reduce((best, s) => (Math.abs(SNAP_PX(s) - h) < Math.abs(SNAP_PX(best) - h) ? s : best), 'half' as Snap));
  };

  return (
    <div className="app">
      <MapView
        config={config}
        theme={theme.resolved}
        markers={markers}
        onReady={(h) => {
          handle.current = h;
          setCam({ bbox: h.getBounds(), zoom: h.getCamera().zoom });
        }}
        onCameraIdle={(e) => setCam({ bbox: e.bbox, zoom: e.camera.zoom })}
        onClick={() => view.type === 'detail' && setView({ type: 'list' })}
        onLongPress={(e) => !placing && startCreate({ location: e.position, source: 'manual' })}
        onMarkerClick={({ marker }) => {
          if (placing) return;
          if (marker.kind === 'cluster') {
            const id = Number(marker.id.slice(2));
            handle.current?.setCamera({ center: marker.position, zoom: Math.min(index.getClusterExpansionZoom(id), 18) });
          } else openDetail(marker.id);
        }}
      />

      {placing && (
        <>
          <div className="crosshair" aria-hidden>
            <PinPreview icon={previewIcon ?? editing?.icon ?? { key: 'pin.default', color: '#3366FF' }} />
          </div>
          <div className="place-hint glass">지도를 움직여 핀 위치를 맞춰 주세요</div>
        </>
      )}

      {isMobile ? (
        <>
          <div className="mobile-search">{searchBar(true)}</div>
          <div className="topbar-right">
            <AccountMenu theme={theme.resolved} onToggleTheme={theme.toggle} />
          </div>
          <div
            className={`sheet glass ${dragH !== null ? 'dragging' : ''}`}
            style={{ height: dragH ?? SNAP_PX(snap) }}
            data-testid="sheet"
          >
            <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="시트 크기 조절" role="slider" aria-valuetext={snap} />
            {tabs && <div className="panel-head" style={{ paddingTop: 0 }}>{tabs}</div>}
            <div className="panel-body">{body}</div>
          </div>
        </>
      ) : (
        <>
          <aside className="panel glass" aria-label="장소 패널" data-testid="panel">
            <div className="panel-head">
              <div className="row between" style={{ padding: '2px 4px 0' }}>
                <span className="brand" style={{ fontSize: 17 }}>
                  <span className="brand-mark" style={{ width: 26, height: 26, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: iconSvg('pin.default', 15) }} />
                  Mappin
                </span>
                <span className="t-caption">{me?.display_name}님의 지도</span>
              </div>
              {searchBar(false)}
              {tabs}
            </div>
            <div className="panel-body">{body}</div>
          </aside>
          <div className="topbar-right">
            <AccountMenu theme={theme.resolved} onToggleTheme={theme.toggle} />
          </div>
        </>
      )}

      <div className="fab-stack" style={isMobile ? { bottom: (dragH ?? SNAP_PX(snap)) + 12 } : undefined}>
        {!placing && (
          <button className="map-btn primary" onClick={() => startCreate()} aria-label="새 장소 (N)" title="새 장소 (N)">
            <Plus size={22} />
          </button>
        )}
        <button className="map-btn glass" onClick={locate} aria-label="내 위치">
          <LocateFixed size={19} />
        </button>
        {!isMobile && (
          <div className="zoom-group">
            <button className="map-btn glass" aria-label="확대" onClick={() => handle.current?.setCamera({ zoom: handle.current.getCamera().zoom + 1 })}>
              <Plus size={18} />
            </button>
            <button className="map-btn glass" aria-label="축소" onClick={() => handle.current?.setCamera({ zoom: handle.current.getCamera().zoom - 1 })}>
              <Minus size={18} />
            </button>
          </div>
        )}
      </div>

      {shareTarget && <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}

function PinPreview({ icon }: { icon: { key: string; color: string } }) {
  return (
    <div className="pin draft">
      <span className="pin-tail" style={{ background: icon.color }} />
      <span className="pin-body" style={{ background: icon.color }} dangerouslySetInnerHTML={{ __html: iconSvg(icon.key) }} />
    </div>
  );
}
