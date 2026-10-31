import type { BBox, Camera, MapEvents, MapHandle, MapProvider, MarkerSpec, MountOptions } from '@mappin/map-core';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import { createMarkerEl, markerKey, updateMarkerEl } from './pins';

type Handlers = { [E in keyof MapEvents]: Set<(e: MapEvents[E]) => void> };

/** MapLibre GL 어댑터 — OSM 벡터타일(OpenFreeMap) 또는 데모 스타일 */
export const maplibreProvider: MapProvider<HTMLElement> & { setStyle?(h: MapHandle, url: string): void } = {
  id: 'maplibre',
  async load() {
    await import('maplibre-gl');
  },
  async mount(container, opts: MountOptions & { fallbackStyleUrl?: string }) {
    const ml = (await import('maplibre-gl')).default;
    const map: MLMap = new ml.Map({
      container,
      style: opts.styleUrl ?? '',
      center: [opts.camera.center.lng, opts.camera.center.lat],
      zoom: opts.camera.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    // 스타일 로딩 실패(예: 다크 스타일 미제공) 시 기본 스타일로 대체
    let fellBack = false;
    map.on('error', (e: any) => {
      if (!fellBack && opts.fallbackStyleUrl && !map.isStyleLoaded() && String(e?.error?.message ?? '').match(/style|Failed to fetch|404/i)) {
        fellBack = true;
        map.setStyle(opts.fallbackStyleUrl);
      }
    });

    const handlers: Handlers = { cameraIdle: new Set(), click: new Set(), longPress: new Set(), markerClick: new Set() };
    const markers = new Map<string, { marker: MLMarker; spec: MarkerSpec; key: string }>();
    const emit = <E extends keyof MapEvents>(e: E, payload: MapEvents[E]) => handlers[e].forEach((h) => (h as any)(payload));

    const getCamera = (): Camera => ({ center: { lat: map.getCenter().lat, lng: map.getCenter().lng }, zoom: map.getZoom() });
    const getBounds = (): BBox => {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    };
    map.on('moveend', () => emit('cameraIdle', { camera: getCamera(), bbox: getBounds() }));
    map.on('load', () => emit('cameraIdle', { camera: getCamera(), bbox: getBounds() }));
    map.on('click', (e) => emit('click', { position: { lat: e.lngLat.lat, lng: e.lngLat.lng } }));
    map.on('contextmenu', (e) => emit('longPress', { position: { lat: e.lngLat.lat, lng: e.lngLat.lng } }));
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    map.on('touchstart', (e) => {
      if (e.originalEvent.touches.length !== 1) return;
      pressTimer = setTimeout(() => emit('longPress', { position: { lat: e.lngLat.lat, lng: e.lngLat.lng } }), 550);
    });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => map.on(ev as any, () => clearTimeout(pressTimer)));

    let userDot: MLMarker | null = null;

    const handle: MapHandle = {
      provider: 'maplibre',
      getCamera,
      getBounds,
      setCamera(c, o) {
        const opt = { center: c.center ? ([c.center.lng, c.center.lat] as [number, number]) : undefined, zoom: c.zoom };
        if (o?.animate === false) map.jumpTo(opt);
        else map.easeTo({ ...opt, duration: 450 });
      },
      fitBounds(b, o) {
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: o?.padding ?? 60, animate: o?.animate ?? true, maxZoom: 16 });
      },
      setMarkers(specs) {
        const next = new Set(specs.map((s) => s.id));
        for (const [id, m] of markers) {
          if (!next.has(id)) {
            m.marker.remove();
            markers.delete(id);
          }
        }
        for (const spec of specs) {
          const key = markerKey(spec);
          const cur = markers.get(spec.id);
          if (cur) {
            cur.marker.setLngLat([spec.position.lng, spec.position.lat]);
            if (cur.key !== key) updateMarkerEl(cur.marker.getElement(), spec);
            cur.spec = spec;
            cur.key = key;
            continue;
          }
          const el = createMarkerEl(spec);
          const entry = { marker: null as unknown as MLMarker, spec, key };
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            emit('markerClick', { marker: entry.spec });
          });
          entry.marker = new ml.Marker({ element: el, anchor: spec.kind === 'cluster' ? 'center' : 'bottom' })
            .setLngLat([spec.position.lng, spec.position.lat])
            .addTo(map);
          markers.set(spec.id, entry);
        }
      },
      setUserLocation(p) {
        userDot?.remove();
        userDot = null;
        if (!p) return;
        const el = document.createElement('div');
        el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#3366FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(51,102,255,.2)';
        userDot = new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      },
      on(event, h) {
        (handlers[event] as Set<any>).add(h);
        return () => (handlers[event] as Set<any>).delete(h);
      },
      destroy() {
        map.remove();
      },
    };
    (handle as any)._map = map;
    return handle;
  },
  setStyle(h, url) {
    (h as any)._map?.setStyle(url);
  },
};
