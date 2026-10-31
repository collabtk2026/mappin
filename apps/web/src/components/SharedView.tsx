'use client';
import type { PublicShareView } from '@mappin/api-client';
import type { MapHandle, MarkerSpec } from '@mappin/map-core';
import { ArrowLeft, Link2Off, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { fullTime, relTime } from '@/lib/format';
import { IconDot, iconSvg } from '@/lib/icons';
import { useMediaQuery, useTheme } from '@/lib/theme';
import { MapView } from './MapView';
import { Empty } from './ui';

/** 로그인 없이 보는 읽기 전용 공유 지도 */
export function SharedView({ data, status }: { data: PublicShareView | null; status: number }) {
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width: 899px)');
  const [sel, setSel] = useState<string | null>(null);
  const handle = useRef<MapHandle | null>(null);
  const places = data?.places ?? [];
  const markers = useMemo<MarkerSpec[]>(
    () => places.map((p) => ({ kind: 'place', id: p.id, position: p.location, icon: p.icon, title: p.title, selected: p.id === sel })),
    [places, sel],
  );

  if (!data) {
    return (
      <div className="auth-form" style={{ minHeight: '100%' }}>
        <Empty
          icon={<Link2Off size={44} strokeWidth={1.5} />}
          title={status === 410 ? '만료되거나 회수된 공유예요' : '공유를 찾을 수 없어요'}
          desc="공유한 분에게 새 링크를 요청해 보세요"
          action={<Link className="btn btn-primary" href="/">Mappin 시작하기</Link>}
        />
      </div>
    );
  }
  const selected = places.find((p) => p.id === sel);
  const content = selected ? (
    <div className="stack">
      <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setSel(null)}>
        <ArrowLeft size={16} /> 목록
      </button>
      <div className="detail-head">
        <IconDot icon={selected.icon} size="lg" />
        <div className="grow">
          <div className="breadcrumb">{selected.category_path?.map((c) => <span key={c.id}>{c.name}</span>)}</div>
          <h2 className="t-title" style={{ margin: 0 }}>{selected.title}</h2>
        </div>
      </div>
      {selected.tags.length > 0 && <div className="chips">{selected.tags.map((t) => <span key={t.tag_id} className="chip small">#{t.name}</span>)}</div>}
      {(selected.address?.road ?? selected.address?.jibun) && (
        <div className="kv"><MapPin size={16} /><span>{selected.address?.road ?? selected.address?.jibun}</span></div>
      )}
      <div className="timeline">
        {selected.recent_notes?.map((n) => (
          <div key={n.id} className="tl-item note">
            <div className="tl-note">{n.body}</div>
            <div className="tl-meta num" title={fullTime(n.noted_at)}>{relTime(n.noted_at)}</div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="place-list">
      {places.map((p) => (
        <button key={p.id} className="place-row" onClick={() => (setSel(p.id), handle.current?.setCamera({ center: p.location, zoom: 15 }))}>
          <IconDot icon={p.icon} />
          <div className="grow">
            <div className="title">{p.title}</div>
            <div className="meta">{[p.category_path?.at(-1)?.name, p.note_count ? `메모 ${p.note_count}` : null].filter(Boolean).join(' · ')}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const head = (
    <div className="panel-head">
      <span className="brand" style={{ fontSize: 16 }}>
        <span className="brand-mark" style={{ width: 24, height: 24, borderRadius: 7 }} dangerouslySetInnerHTML={{ __html: iconSvg('pin.default', 14) }} />
        Mappin
      </span>
      <div className="share-banner">
        <div className="t-caption">{data.share?.owner?.display_name}님이 공유한 {data.share?.target_type === 'category' ? '카테고리' : '장소'}</div>
        <div className="t-title" data-testid="share-title">{data.share?.title}</div>
        {data.share?.message && <div className="t-body muted">{data.share.message}</div>}
        <div className="t-caption num">장소 {places.length}곳 · 보기 전용</div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {data.map_config && (
        <MapView
          config={data.map_config}
          theme={theme.resolved}
          markers={markers}
          onReady={(h) => {
            handle.current = h;
            if (places.length > 1) {
              const lngs = places.map((p) => p.location.lng), lats = places.map((p) => p.location.lat);
              h.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: 80, animate: false });
            } else if (places[0]) h.setCamera({ center: places[0].location, zoom: 15 }, { animate: false });
          }}
          onMarkerClick={({ marker }) => setSel(marker.id)}
        />
      )}
      {isMobile ? (
        <div className="sheet glass" style={{ height: '46vh' }}>
          <div className="sheet-handle" />
          {head}
          <div className="panel-body">{content}</div>
        </div>
      ) : (
        <aside className="panel glass">
          {head}
          <div className="panel-body">{content}</div>
        </aside>
      )}
      <div className="topbar-right">
        <Link className="btn btn-primary" href="/signup" style={{ boxShadow: 'var(--shadow-2)' }}>나도 지도 만들기</Link>
      </div>
    </div>
  );
}
