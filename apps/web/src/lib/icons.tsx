import {
  Briefcase, Camera, Coffee, Croissant, Dumbbell, Gift, GraduationCap, Heart, HeartPulse, House, Landmark, MapPin, Mountain,
  Music, Palette, Plane, ShoppingBag, SquareParking, Star, Trees, UtensilsCrossed, Waves, Wine, BedDouble,
  type IconNode,
} from 'lucide';
import { createElement } from 'react';

/** 시스템 아이콘 키 → Lucide 아이콘 (docs/06 §5, db icons 테이블과 동일) */
export const ICONS: Record<string, { node: IconNode; label: string; group: string }> = {
  'pin.default': { node: MapPin, label: '기본 핀', group: 'etc' },
  food: { node: UtensilsCrossed, label: '음식점', group: 'food' },
  cafe: { node: Coffee, label: '카페', group: 'food' },
  bar: { node: Wine, label: '바', group: 'food' },
  bakery: { node: Croissant, label: '베이커리', group: 'food' },
  travel: { node: Plane, label: '여행', group: 'travel' },
  hotel: { node: BedDouble, label: '숙소', group: 'travel' },
  nature: { node: Trees, label: '자연', group: 'nature' },
  beach: { node: Waves, label: '바다', group: 'nature' },
  mountain: { node: Mountain, label: '산', group: 'nature' },
  shopping: { node: ShoppingBag, label: '쇼핑', group: 'shopping' },
  gift: { node: Gift, label: '선물', group: 'shopping' },
  culture: { node: Landmark, label: '문화', group: 'culture' },
  art: { node: Palette, label: '전시', group: 'culture' },
  music: { node: Music, label: '공연', group: 'culture' },
  camera: { node: Camera, label: '사진 명소', group: 'culture' },
  sport: { node: Dumbbell, label: '운동', group: 'life' },
  health: { node: HeartPulse, label: '병원', group: 'life' },
  school: { node: GraduationCap, label: '학교', group: 'life' },
  work: { node: Briefcase, label: '회사', group: 'life' },
  home: { node: House, label: '집', group: 'life' },
  parking: { node: SquareParking, label: '주차', group: 'life' },
  star: { node: Star, label: '즐겨찾기', group: 'etc' },
  heart: { node: Heart, label: '하트', group: 'etc' },
};
export const ICON_KEYS = Object.keys(ICONS);

/** 카테고리/핀 10색 (docs/06 §2.1) */
export const PALETTE = ['#3366FF', '#E4572E', '#F08C00', '#2E9F6B', '#12A4B6', '#7B61FF', '#E5487D', '#9C6B4E', '#5B6B7F', '#1F2328'];

const ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** 지도 마커(DOM)용 SVG 문자열 */
export function iconSvg(key: string, size = 18): string {
  const node = (ICONS[key] ?? ICONS['pin.default']!).node;
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(' ')}/>`)
    .join('');
  return `<svg ${ATTRS} width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

/** React용 아이콘 (lucide 노드 데이터를 그대로 사용 → 마커와 100% 동일한 글리프) */
export function Glyph({ k, size = 18, strokeWidth = 2 }: { k: string; size?: number; strokeWidth?: number }) {
  const node = (ICONS[k] ?? ICONS['pin.default']!).node;
  return createElement(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs })),
  );
}

export function IconDot({ icon, size = 'md' }: { icon: { key: string; color: string }; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 24 : size === 'sm' ? 15 : 19;
  return (
    <span className={`icon-dot ${size === 'md' ? '' : size}`} style={{ background: icon.color }}>
      <Glyph k={icon.key} size={px} />
    </span>
  );
}
