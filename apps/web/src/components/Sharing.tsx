'use client';
import type { Share } from '@mappin/api-client';
import { Check, Eye, EyeOff, Inbox, Link2, LogOut, Mail, Send, Users, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { initial, relTime } from '@/lib/format';
import { useInbox, useInvalidate, useShares } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { Empty, Modal, Skeleton } from './ui';

export interface ShareTarget {
  type: 'place' | 'category';
  id: string;
  title: string;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 장소/카테고리 공유 다이얼로그: 이메일 초대 + 링크 */
export function ShareDialog({ target, onClose }: { target: ShareTarget; onClose(): void }) {
  const { data: all = [] } = useShares();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const shares = all.filter((s) => s.target_id === target.id);
  const linkShare = shares.find((s) => s.grantee_type === 'link');

  const invite = async () => {
    setErr(null);
    try {
      await api.post('/shares', { target_type: target.type, target_id: target.id, grantee: { type: 'email', email }, permission });
      setEmail('');
      await invalidate('shares', 'categories');
      toast('공유했어요');
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const makeLink = async () => {
    const s = linkShare
      ? await api.post<Share>(`/shares/${linkShare.id}/rotate-link`)
      : await api.post<Share>('/shares', { target_type: target.type, target_id: target.id, grantee: { type: 'link' } });
    setLink(s.link_url ?? null);
    await invalidate('shares', 'categories');
    if (s.link_url && (await copy(s.link_url))) toast('링크를 복사했어요');
  };
  const revoke = async (s: Share) => {
    await api.del(`/shares/${s.id}`);
    if (s.grantee_type === 'link') setLink(null);
    await invalidate('shares', 'categories');
    toast('공유를 해제했어요');
  };

  return (
    <Modal title={`'${target.title}' 공유`} onClose={onClose}>
      <div className="field">
        <label htmlFor="share-email">이메일로 초대</label>
        <div className="row">
          <input id="share-email" className="input grow" type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email && invite()} />
          <select className="input" style={{ width: 104 }} value={permission} onChange={(e) => setPermission(e.target.value as 'viewer')} aria-label="권한">
            <option value="viewer">보기</option>
            <option value="editor">편집</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={invite} disabled={!email}>
          <Send size={15} />
          초대하기
        </button>
        <div className="t-caption">가입하지 않은 친구도 이 이메일로 가입하면 바로 받을 수 있어요</div>
        {err && <div className="error-box">{err}</div>}
      </div>

      <div className="card">
        <div className="row between">
          <div className="row">
            <Link2 size={18} />
            <div>
              <div className="t-callout">링크로 공유</div>
              <div className="t-caption">링크가 있는 누구나 로그인 없이 볼 수 있어요 (보기 전용)</div>
            </div>
          </div>
        </div>
        {link && (
          <div className="row">
            <input className="input grow" readOnly value={link} aria-label="공유 링크" data-testid="share-link" onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={async () => (await copy(link)) && toast('링크를 복사했어요')}>복사</button>
          </div>
        )}
        <div className="row">
          <button className="btn btn-sm" onClick={makeLink}>
            {linkShare ? '새 링크 발급' : '링크 만들기'}
          </button>
          {linkShare && (
            <button className="btn btn-sm btn-ghost" onClick={() => revoke(linkShare)}>
              링크 끄기
            </button>
          )}
        </div>
        {linkShare && !link && <div className="t-caption">보안을 위해 링크는 만들 때만 보여요. 다시 필요하면 새 링크를 발급하세요 (기존 링크는 무효화)</div>}
      </div>

      {shares.filter((s) => s.grantee_type !== 'link').length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="label">공유 중인 사람</div>
          {shares
            .filter((s) => s.grantee_type !== 'link')
            .map((s) => (
              <div key={s.id} className="row">
                <span className="avatar sm">{initial(s.grantee?.display_name ?? s.grantee_email)}</span>
                <div className="grow">
                  <div className="t-callout">{s.grantee?.display_name ?? s.grantee_email}</div>
                  <div className="t-caption">
                    {s.permission === 'editor' ? '편집' : '보기'} · {s.status === 'pending' ? '수락 대기' : '수락함'}
                  </div>
                </div>
                <button className="icon-btn" aria-label="공유 해제" onClick={() => revoke(s)}>
                  <X size={16} />
                </button>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}

/** 공유 탭: 받은 공유(레이어) + 내가 공유한 것 */
export function SharesPanel({ hidden, onToggleLayer }: { hidden: Set<string>; onToggleLayer(id: string): void }) {
  const { data: inbox, isLoading } = useInbox();
  const { data: mine = [] } = useShares();
  const invalidate = useInvalidate();
  const toast = useToast();
  if (isLoading || !inbox) return <Skeleton rows={2} />;
  const pending = inbox.filter((s) => s.status === 'pending');
  const accepted = inbox.filter((s) => s.status === 'accepted');

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    await fn();
    await invalidate('shared-with-me', 'places', 'categories');
    toast(msg);
  };

  return (
    <div className="stack" style={{ gap: 0 }}>
      {pending.length > 0 && (
        <div className="section">
          <div className="t-headline">새로 받은 공유</div>
          {pending.map((s) => (
            <div key={s.id} className="card" data-testid="pending-share">
              <div className="row">
                <span className="avatar sm">{initial(s.owner?.display_name)}</span>
                <div className="grow">
                  <div className="t-callout">
                    {s.owner?.display_name}님이 <b>{s.target_title}</b>
                    {s.target_type === 'category' ? ` (${s.place_count}곳)` : ''}을(를) 공유했어요
                  </div>
                  <div className="t-caption">{relTime(s.created_at)}</div>
                </div>
              </div>
              <div className="row">
                <button className="btn btn-primary btn-sm grow" onClick={() => act(() => api.post(`/shares/${s.id}/accept`), '내 지도에 추가했어요')}>
                  <Check size={15} />
                  지도에 추가
                </button>
                <button className="btn btn-sm" onClick={() => act(() => api.del(`/shares/${s.id}`), '공유를 거절했어요')}>
                  거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="section">
        <div className="t-headline">받은 레이어</div>
        {accepted.length === 0 ? (
          <Empty icon={<Inbox size={36} strokeWidth={1.5} />} title="받은 공유가 없어요" desc="친구가 장소나 카테고리를 공유하면 여기에 레이어로 쌓여요" />
        ) : (
          accepted.map((s) => (
            <div key={s.id} className="tree-row">
              <span className="avatar sm">{initial(s.owner?.display_name)}</span>
              <div className="grow">
                <div className="t-callout">{s.target_title}</div>
                <div className="t-caption">
                  {s.owner?.display_name} · {s.place_count}곳 · {s.permission === 'editor' ? '편집' : '보기'}
                </div>
              </div>
              <button className={`icon-btn ${hidden.has(s.id) ? '' : 'active'}`} aria-label={hidden.has(s.id) ? '레이어 보이기' : '레이어 숨기기'} onClick={() => onToggleLayer(s.id)}>
                {hidden.has(s.id) ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              <button className="icon-btn" aria-label="공유 나가기" onClick={() => act(() => api.del(`/shares/${s.id}`), '공유에서 나갔어요')}>
                <LogOut size={16} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="section">
        <div className="t-headline">내가 공유한 것</div>
        {mine.length === 0 ? (
          <div className="t-caption">장소나 카테고리의 공유 버튼으로 친구와 함께 볼 수 있어요</div>
        ) : (
          mine.map((s) => (
            <div key={s.id} className="tree-row">
              <span className="icon-dot sm" style={{ background: 'var(--surface-hover)', color: 'var(--text-2)' }}>
                {s.grantee_type === 'link' ? <Link2 size={14} /> : s.grantee_type === 'email' ? <Mail size={14} /> : <Users size={14} />}
              </span>
              <div className="grow">
                <div className="t-callout">{s.target_title}</div>
                <div className="t-caption">
                  {s.grantee_type === 'link' ? '링크 공유' : s.grantee?.display_name ?? s.grantee_email} · {s.status === 'pending' ? '수락 대기' : '공유 중'}
                </div>
              </div>
              <button className="icon-btn" aria-label="공유 해제" onClick={() => act(() => api.del(`/shares/${s.id}`), '공유를 해제했어요')}>
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
