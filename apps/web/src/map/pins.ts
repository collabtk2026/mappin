import type { MarkerSpec } from '@mappin/map-core';
import { iconSvg } from '@/lib/icons';

/** 공급자 공통 핀/클러스터 DOM (디자인: docs/06 §4 Pin, Cluster) */
export function createMarkerEl(m: MarkerSpec): HTMLElement {
  const el = document.createElement('div');
  updateMarkerEl(el, m);
  return el;
}

export function updateMarkerEl(el: HTMLElement, m: MarkerSpec) {
  if (m.kind === 'cluster') {
    const size = Math.round(Math.min(56, 34 + Math.log2(m.count) * 5));
    el.className = 'cluster';
    el.style.width = el.style.height = `${size}px`;
    el.textContent = m.count > 999 ? '999+' : String(m.count);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `장소 ${m.count}곳 묶음`);
    return;
  }
  el.className = `pin${m.selected ? ' selected' : ''}`;
  el.dataset.placeId = m.id;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', m.title ?? '장소');
  el.title = m.title ?? '';
  el.innerHTML = `<span class="pin-tail" style="background:${m.icon.color}"></span><span class="pin-body" style="background:${m.icon.color}">${iconSvg(m.icon.key)}</span>${
    m.badge ? `<span class="pin-badge">${escapeHtml(m.badge.label.slice(0, 1))}</span>` : ''
  }`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const markerKey = (m: MarkerSpec) =>
  m.kind === 'cluster' ? `c:${m.count}` : `p:${m.icon.key}:${m.icon.color}:${m.selected ? 1 : 0}:${m.title}:${m.badge?.label ?? ''}`;
