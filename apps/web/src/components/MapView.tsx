'use client';
import { selectProvider, type Camera, type MapConfig as CoreMapConfig, type MapHandle, type MapEvents, type MarkerSpec } from '@mappin/map-core';
import type { MapConfig } from '@mappin/api-client';
import { useEffect, useRef } from 'react';
import { kakaoProvider } from '@/map/kakao';
import { maplibreProvider } from '@/map/maplibre';

interface Props {
  config: MapConfig;
  theme: 'light' | 'dark';
  markers: MarkerSpec[];
  initialCamera?: Camera;
  onReady?(h: MapHandle): void;
  onCameraIdle?(e: MapEvents['cameraIdle']): void;
  onClick?(e: MapEvents['click']): void;
  onLongPress?(e: MapEvents['longPress']): void;
  onMarkerClick?(e: MapEvents['markerClick']): void;
}

/** 공급자 독립 지도. /v1/map/config 기준으로 위치에 맞는 공급자를 고른다 */
export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const cfg = p.config as unknown as CoreMapConfig & { default_provider: { style_url_dark?: string | null } };

  useEffect(() => {
    let disposed = false;
    const camera = p.initialCamera ?? {
      center: p.config.initial_camera?.center ?? { lat: 37.5446, lng: 127.0559 },
      zoom: p.config.initial_camera?.zoom ?? 12,
    };
    const choice = selectProvider(cfg, camera.center) as typeof cfg.default_provider;
    const darkUrl = (choice as any).style_url_dark as string | null | undefined;
    const provider = choice.id === 'kakao' ? kakaoProvider : maplibreProvider;
    provider
      .mount(el.current!, {
        camera,
        publicKey: choice.public_key,
        styleUrl: p.theme === 'dark' && darkUrl ? darkUrl : choice.style_url,
        fallbackStyleUrl: choice.style_url,
        locale: 'ko',
      } as any)
      .catch(async (err) => {
        // 카카오 SDK 실패 시 MapLibre로 폴백
        console.warn('map provider failed, falling back', err);
        return maplibreProvider.mount(el.current!, { camera, styleUrl: cfg.default_provider.style_url, locale: 'ko' });
      })
      .then((h) => {
        if (disposed) return h.destroy();
        handle.current = h;
        h.on('cameraIdle', (e) => cb.current.onCameraIdle?.(e));
        h.on('click', (e) => cb.current.onClick?.(e));
        h.on('longPress', (e) => cb.current.onLongPress?.(e));
        h.on('markerClick', (e) => cb.current.onMarkerClick?.(e));
        h.setMarkers(cb.current.markers);
        cb.current.onReady?.(h);
      });
    return () => {
      disposed = true;
      handle.current?.destroy();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.config]);

  // 테마 전환 시 스타일만 교체 (MapLibre)
  useEffect(() => {
    const h = handle.current;
    if (!h || h.provider !== 'maplibre') return;
    const d = cfg.default_provider as any;
    maplibreProvider.setStyle?.(h, p.theme === 'dark' && d.style_url_dark ? d.style_url_dark : d.style_url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.theme]);

  useEffect(() => {
    handle.current?.setMarkers(p.markers);
  }, [p.markers]);

  return <div ref={el} className="map-root" data-testid="map" />;
}
