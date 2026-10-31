import { iconSvg } from '@/lib/icons';
import type { ReactNode } from 'react';

const PINS = [
  { k: 'food', c: '#E4572E', x: '18%', y: '30%', d: '0s' },
  { k: 'cafe', c: '#9C6B4E', x: '42%', y: '22%', d: '.4s' },
  { k: 'nature', c: '#2E9F6B', x: '64%', y: '40%', d: '.8s' },
  { k: 'camera', c: '#7B61FF', x: '30%', y: '58%', d: '1.2s' },
  { k: 'star', c: '#F08C00', x: '72%', y: '66%', d: '.2s' },
  { k: 'beach', c: '#12A4B6', x: '52%', y: '74%', d: '1s' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-hero" aria-hidden>
        <div className="grid-lines" />
        <div className="floating-pins">
          {PINS.map((p) => (
            <div key={p.k} className="pin" style={{ left: p.x, top: p.y, animationDelay: p.d }}>
              <span className="pin-tail" style={{ background: p.c }} />
              <span className="pin-body" style={{ background: p.c }} dangerouslySetInnerHTML={{ __html: iconSvg(p.k) }} />
            </div>
          ))}
        </div>
        <span className="brand">
          <span className="brand-mark" dangerouslySetInnerHTML={{ __html: iconSvg('pin.default', 18) }} />
          Mappin
        </span>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <div className="t-display">
            가본 곳, 가고 싶은 곳,
            <br />
            그곳의 기억까지.
          </div>
          <p className="t-body muted" style={{ marginTop: 12 }}>
            장소를 저장하고 시간이 지나며 쌓이는 메모와 태그를 지도 위에서 다시 만나요. 카테고리로 묶어 친구와 나눌 수도 있어요.
          </p>
        </div>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}
