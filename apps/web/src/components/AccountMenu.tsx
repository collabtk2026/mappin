'use client';
import { Download, LogOut, Moon, Settings, Sun, UserX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { initial } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Modal } from './ui';

export function AccountMenu({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme(): void }) {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-label="계정 메뉴" aria-expanded={open}>
        {initial(me?.display_name)}
      </button>
      {open && (
        <div className="menu glass" role="menu">
          <div className="menu-head">
            <div className="t-callout">{me?.display_name}</div>
            <div className="t-caption">{me?.email}</div>
          </div>
          <div className="divider" />
          <button className="menu-item" role="menuitem" onClick={() => (onToggleTheme(), setOpen(false))}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            {theme === 'dark' ? '라이트 모드' : '다크 모드'}
          </button>
          <button className="menu-item" role="menuitem" onClick={() => (setSettings(true), setOpen(false))}>
            <Settings size={17} />
            설정 · 내보내기
          </button>
          <button className="menu-item" role="menuitem" onClick={() => (setOpen(false), logout())}>
            <LogOut size={17} />
            로그아웃
          </button>
        </div>
      )}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}

function SettingsModal({ onClose }: { onClose(): void }) {
  const { me, setMe, deleteAccount } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(me?.display_name ?? '');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const exportAs = async (format: 'geojson' | 'csv' | 'gpx' | 'kml') => {
    const job = await api.post<{ result_url: string }>('/export', { format });
    const res = await api.get<Response>(job.result_url.replace(/^\/v1/, ''), { raw: true });
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `mappin.${format}`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
    toast('내보냈어요');
  };

  return (
    <Modal title="설정" onClose={onClose}>
      <div className="field">
        <label htmlFor="display-name">이름</label>
        <div className="row">
          <input id="display-name" className="input grow" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button
            className="btn"
            onClick={async () => {
              try {
                setMe(await api.patch('/me', { display_name: name }));
                toast('저장했어요');
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          >
            저장
          </button>
        </div>
      </div>
      <div className="field">
        <label>내 데이터 내보내기</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {(['geojson', 'csv', 'gpx', 'kml'] as const).map((f) => (
            <button key={f} className="btn btn-sm" onClick={() => exportAs(f)}>
              <Download size={14} />
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="t-caption">장소 {me?.stats?.places ?? 0}곳 · 카테고리 {me?.stats?.categories ?? 0}개 · 태그 {me?.stats?.tags ?? 0}개</div>
      </div>
      <div className="card" style={{ background: 'var(--danger-soft)' }}>
        <div className="row t-callout" style={{ color: 'var(--danger)' }}>
          <UserX size={16} />
          회원 탈퇴
        </div>
        <div className="t-caption" style={{ color: 'var(--text-2)' }}>
          바로 로그아웃되고 공유가 모두 해제돼요. 7일 뒤 모든 데이터가 영구 삭제돼요. 계속하려면 &lsquo;탈퇴&rsquo;를 입력하세요.
        </div>
        <div className="row">
          <input className="input grow" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="탈퇴" aria-label="탈퇴 확인" />
          <button className="btn btn-danger" disabled={confirm !== '탈퇴'} onClick={deleteAccount}>
            탈퇴하기
          </button>
        </div>
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
