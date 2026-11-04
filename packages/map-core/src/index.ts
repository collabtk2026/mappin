/**
 * @mappin/map-core — 지도 공급자 독립 인터페이스.
 * UI(웹/RN)는 이 타입만 의존하고, 실제 SDK 호출은 공급자별 어댑터가 담당한다.
 *   - apps/web/src/map/maplibre.ts : MapLibre GL JS (+ OSM 벡터타일)
 *   - apps/web/src/map/kakao.ts    : Kakao Maps JS SDK
 *   - RN 어댑터 (Kakao/Naver/MapLibre) — P1
 */

export type ProviderId = 'kakao' | 'naver' | 'maplibre' | 'google';

export interface LatLng {
  lat: number;
  lng: number;
}

/** [west, south, east, north] — lng/lat 순서 (GeoJSON bbox 규약) */
export type BBox = [number, number, number, number];

export interface Camera {
  center: LatLng;
  zoom: number; // 0..22, 공급자별 줌 체계 차이는 어댑터가 변환 (예: Kakao level ↔ zoom)
  bearing?: number;
}

export interface IconRef {
  key: string; // 'food.ramen'
  color: string; // '#E4572E'
  source: 'place' | 'category' | 'default';
}

/** 공급자 무관 마커 모델. 클러스터도 같은 모델로 렌더링한다. */
export type MarkerSpec =
  | {
      kind: 'place';
      id: string;
      position: LatLng;
      icon: IconRef;
      title?: string;
      /** 공유받은 레이어 표시용 배지 (공유자 아바타 등) */
      badge?: { type: 'shared'; label: string };
      selected?: boolean;
    }
  | {
      kind: 'cluster';
      id: string;
      position: LatLng;
      count: number;
      topIcon?: IconRef;
      expansionZoom?: number;
    };

export interface MapEvents {
  cameraIdle: { camera: Camera; bbox: BBox };
  click: { position: LatLng };
  longPress: { position: LatLng };
  markerClick: { marker: MarkerSpec };
}

export type Unsubscribe = () => void;

export interface MapHandle {
  readonly provider: ProviderId;
  getCamera(): Camera;
  getBounds(): BBox;
  setCamera(camera: Partial<Camera>, opts?: { animate?: boolean }): void;
  fitBounds(bbox: BBox, opts?: { padding?: number; animate?: boolean }): void;
  /** 전체 마커 집합을 넘기면 어댑터가 id 기준 diff로 추가/갱신/삭제한다. */
  setMarkers(markers: readonly MarkerSpec[]): void;
  /** 내 위치 점 표시 (권한 획득은 앱 레이어 책임) */
  setUserLocation(position: LatLng | null, accuracyM?: number): void;
  on<E extends keyof MapEvents>(event: E, handler: (e: MapEvents[E]) => void): Unsubscribe;
  destroy(): void;
}

export interface MountOptions {
  camera: Camera;
  publicKey?: string | null;
  styleUrl?: string | null;
  locale?: string;
  /** 공급자 저작권 표기는 숨기지 않는다 (약관). 위치만 조정 가능. */
  attributionPosition?: 'bottom-left' | 'bottom-right';
}

export interface MapProvider<Container = unknown> {
  readonly id: ProviderId;
  /** SDK 스크립트/네이티브 모듈 로딩 (지연 로딩) */
  load(opts: { publicKey?: string | null }): Promise<void>;
  mount(container: Container, opts: MountOptions): Promise<MapHandle>;
}

/** /v1/map/config 응답에서 현재 위치에 맞는 공급자 설정을 고른다. */
export interface ProviderConfig {
  id: ProviderId;
  public_key?: string | null;
  style_url?: string | null;
  attribution?: string;
  search_provider?: 'kakao' | 'naver' | 'google' | 'osm';
}

export interface MapConfig {
  default_provider: ProviderConfig;
  regions: { name: string; bbox: BBox; provider: ProviderConfig }[];
}

export function contains(bbox: BBox, p: LatLng): boolean {
  const [w, s, e, n] = bbox;
  return p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;
}

export function selectProvider(config: MapConfig, at: LatLng): ProviderConfig {
  return config.regions.find((r) => contains(r.bbox, at))?.provider ?? config.default_provider;
}

/** 아이콘 결정 규칙: 장소 지정 > 카테고리 기본 > 시스템 기본 (서버와 동일 규칙) */
export const DEFAULT_ICON: IconRef = { key: 'pin.default', color: '#3366FF', source: 'default' };

export function resolveIcon(
  place: { icon_key?: string | null; color?: string | null },
  category?: { icon_key?: string | null; color?: string | null } | null,
): IconRef {
  if (place.icon_key) {
    return { key: place.icon_key, color: place.color ?? category?.color ?? DEFAULT_ICON.color, source: 'place' };
  }
  if (category?.icon_key) {
    return { key: category.icon_key, color: place.color ?? category.color ?? DEFAULT_ICON.color, source: 'category' };
  }
  return { ...DEFAULT_ICON, color: place.color ?? category?.color ?? DEFAULT_ICON.color };
}
