import type { BBox, Camera, MapEvents, MapHandle, MapProvider, MarkerSpec, MountOptions } from '@mappin/map-core';
import { createMarkerEl, markerKey, updateMarkerEl } from './pins';

/**
 * Kakao Maps JS SDK 어댑터 (국내 기본, KAKAO_JS_KEY 설정 시 /v1/map/config가 KR 지역에 지정).
 * 줌 변환: Kakao level(1=가장 상세 … 14) ↔ zoom ≈ 20 - level
 * ⚠️ 이 개발 환경에서는 카카오 키/네트워크가 없어 실제 SDK로 검증하지 못했다 (MapLibre 어댑터로 E2E 검증).
 */
declare global {
  interface Window {
    kakao?: any;
  }
}

let loading: Promise<void> | null = null;
function loadSdk(appKey: string): Promise<void> {
  if (window.kakao?.maps?.LatLng) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    s.async = true;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error('Kakao SDK load failed'));
    document.head.appendChild(s);
  });
  return loading;
}

const toLevel = (zoom: number) => Math.min(14, Math.max(1, Math.round(20 - zoom)));
const toZoom = (level: number) => 20 - level;

export const kakaoProvider: MapProvider<HTMLElement> = {
  id: 'kakao',
  async load({ publicKey }) {
    if (!publicKey) throw new Error('Kakao JS key missing');
    await loadSdk(publicKey);
  },
  async mount(container, opts: MountOptions) {
    await this.load({ publicKey: opts.publicKey });
    const k = window.kakao.maps;
    const map = new k.Map(container, { center: new k.LatLng(opts.camera.center.lat, opts.camera.center.lng), level: toLevel(opts.camera.zoom) });
    const handlers: { [E in keyof MapEvents]: Set<(e: MapEvents[E]) => void> } = {
      cameraIdle: new Set(), click: new Set(), longPress: new Set(), markerClick: new Set(),
    };
    const emit = <E extends keyof MapEvents>(e: E, p: MapEvents[E]) => handlers[e].forEach((h) => (h as any)(p));
    const getCamera = (): Camera => {
      const c = map.getCenter();
      return { center: { lat: c.getLat(), lng: c.getLng() }, zoom: toZoom(map.getLevel()) };
    };
    const getBounds = (): BBox => {
      const b = map.getBounds();
      return [b.getSouthWest().getLng(), b.getSouthWest().getLat(), b.getNorthEast().getLng(), b.getNorthEast().getLat()];
    };
    k.event.addListener(map, 'idle', () => emit('cameraIdle', { camera: getCamera(), bbox: getBounds() }));
    k.event.addListener(map, 'click', (e: any) => emit('click', { position: { lat: e.latLng.getLat(), lng: e.latLng.getLng() } }));
    k.event.addListener(map, 'rightclick', (e: any) => emit('longPress', { position: { lat: e.latLng.getLat(), lng: e.latLng.getLng() } }));

    const overlays = new Map<string, { o: any; el: HTMLElement; spec: MarkerSpec; key: string }>();
    let userDot: any = null;
    return {
      provider: 'kakao',
      getCamera,
      getBounds,
      setCamera(c, o) {
        if (c.zoom !== undefined) map.setLevel(toLevel(c.zoom), { animate: o?.animate !== false });
        if (c.center) {
          const ll = new k.LatLng(c.center.lat, c.center.lng);
          o?.animate === false ? map.setCenter(ll) : map.panTo(ll);
        }
      },
      fitBounds(b) {
        map.setBounds(new k.LatLngBounds(new k.LatLng(b[1], b[0]), new k.LatLng(b[3], b[2])));
      },
      setMarkers(specs) {
        const next = new Set(specs.map((s) => s.id));
        for (const [id, m] of overlays) if (!next.has(id)) (m.o.setMap(null), overlays.delete(id));
        for (const spec of specs) {
          const key = markerKey(spec);
          const pos = new k.LatLng(spec.position.lat, spec.position.lng);
          const cur = overlays.get(spec.id);
          if (cur) {
            cur.o.setPosition(pos);
            if (cur.key !== key) updateMarkerEl(cur.el, spec);
            cur.spec = spec;
            cur.key = key;
            continue;
          }
          const el = createMarkerEl(spec);
          const entry = { o: null as any, el, spec, key };
          el.addEventListener('click', (ev) => (ev.stopPropagation(), emit('markerClick', { marker: entry.spec })));
          entry.o = new k.CustomOverlay({ position: pos, content: el, yAnchor: spec.kind === 'cluster' ? 0.5 : 1, clickable: true });
          entry.o.setMap(map);
          overlays.set(spec.id, entry);
        }
      },
      setUserLocation(p) {
        userDot?.setMap(null);
        if (!p) return;
        const el = document.createElement('div');
        el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#3366FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(51,102,255,.2)';
        userDot = new k.CustomOverlay({ position: new k.LatLng(p.lat, p.lng), content: el });
        userDot.setMap(map);
      },
      on(event, h) {
        (handlers[event] as Set<any>).add(h);
        return () => (handlers[event] as Set<any>).delete(h);
      },
      destroy() {
        overlays.forEach((m) => m.o.setMap(null));
        container.innerHTML = '';
      },
    } satisfies MapHandle;
  },
};
