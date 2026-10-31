'use client';
import type { Note, NoteRevision, Place, TimelineItem } from '@mappin/api-client';
import { ArrowLeft, Calendar, Copy, ExternalLink, History, Lock, MapPin, Pencil, Share2, Trash2, Crosshair, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { fullTime, relTime } from '@/lib/format';
import { IconDot } from '@/lib/icons';
import { usePlace, useInvalidate, useTimeline } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { Modal, Skeleton } from './ui';

interface Props {
  id: string;
  onBack(): void;
  onEdit(p: Place): void;
  onShare(p: Place): void;
  onFocus(p: Place): void;
  onDeleted(): void;
}

const EVENT_TEXT: Record<string, (d: any) => React.ReactNode> = {
  'place.created': (d) => (d.source === 'shared_copy' ? '공유받은 장소를 내 장소로 복사했어요' : '장소를 저장했어요'),
  'place.updated': (d) => (d.title ? <>이름을 <b>{d.title.to}</b>(으)로 바꿨어요</> : '정보를 수정했어요'),
  'place.moved': () => '위치를 옮겼어요',
  'place.deleted': () => '휴지통으로 옮겼어요',
  'place.restored': () => '휴지통에서 복원했어요',
  'icon.changed': () => '아이콘을 바꿨어요',
  'category.changed': (d) => (d.name ? <><b>{d.name}</b> 카테고리로 옮겼어요</> : '카테고리를 바꿨어요'),
  'tag.added': (d) => <><b>#{d.name}</b> 태그를 붙였어요</>,
  'tag.removed': (d) => <><b>#{d.name ?? '태그'}</b> 태그를 뗐어요</>,
};

export function PlaceDetail({ id, onBack, onEdit, onShare, onFocus, onDeleted }: Props) {
  const { data: place, isLoading } = usePlace(id);
  const { data: timeline = [] } = useTimeline(id);
  const invalidate = useInvalidate();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [revisionsOf, setRevisionsOf] = useState<Note | null>(null);

  if (isLoading || !place) return <Skeleton rows={3} />;
  const isOwner = place.permission === 'owner';
  const canWrite = place.permission !== 'viewer';

  async function addNote() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.post(`/places/${id}/notes`, { body: draft.trim(), is_private: isPrivate }, { headers: { 'idempotency-key': crypto.randomUUID() } });
      setDraft('');
      setPrivate(false);
      await invalidate('timeline', 'place', 'places');
      toast('메모를 남겼어요');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await api.del(`/places/${id}`);
    await invalidate('places', 'categories', 'tags');
    onDeleted();
    toast('휴지통으로 옮겼어요', {
      label: '되돌리기',
      run: async () => {
        await api.post(`/places/${id}/restore`);
        await invalidate('places', 'categories', 'tags', 'place');
      },
    });
  }

  async function copyToMine() {
    try {
      await api.post(`/places/${id}/copy`, { include_notes: true });
      await invalidate('places');
      toast('내 장소로 복사했어요');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const ref = place.provider_refs?.[0];
  const address = place.address?.road ?? place.address?.jibun;

  return (
    <div className="stack" style={{ gap: 0 }} data-testid="place-detail">
      <div className="row" style={{ padding: '6px 0 4px' }}>
        <button className="icon-btn" onClick={onBack} aria-label="목록으로">
          <ArrowLeft size={20} />
        </button>
        <div className="grow" />
        {!isOwner && <span className="badge">{place.permission === 'editor' ? '편집 가능' : '보기 전용'}</span>}
      </div>

      <div className="detail-head">
        <IconDot icon={place.icon} size="lg" />
        <div className="grow">
          {place.category_path && place.category_path.length > 0 && (
            <div className="breadcrumb">
              {place.category_path.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>
          )}
          <h2 className="t-title" style={{ margin: '2px 0 0' }}>{place.title}</h2>
          {!isOwner && place.owner && <div className="t-caption">{place.owner.display_name}님이 공유한 장소</div>}
        </div>
      </div>

      {place.tags.length > 0 && (
        <div className="chips" style={{ padding: '8px 0 4px' }}>
          {place.tags.map((t) => (
            <span key={t.tag_id} className="chip small" title={`${fullTime(t.tagged_at)}에 태그함`}>
              #{t.name}
            </span>
          ))}
        </div>
      )}

      <div className="action-row" style={{ padding: '12px 0' }}>
        {canWrite ? (
          <button className="action" onClick={() => onEdit(place)}>
            <Pencil size={18} />
            수정
          </button>
        ) : (
          <button className="action" onClick={copyToMine}>
            <Copy size={18} />
            내 장소로
          </button>
        )}
        <button className="action" onClick={() => onFocus(place)}>
          <Crosshair size={18} />
          지도에서
        </button>
        <button className="action" disabled={!isOwner} onClick={() => onShare(place)} style={!isOwner ? { opacity: 0.4 } : undefined}>
          <Share2 size={18} />
          공유
        </button>
        <button className="action danger" disabled={!isOwner} onClick={remove} style={!isOwner ? { opacity: 0.4 } : undefined}>
          <Trash2 size={18} />
          삭제
        </button>
      </div>

      <div className="section" style={{ gap: 8 }}>
        {address && (
          <div className="kv">
            <MapPin size={16} />
            <span>{address}</span>
          </div>
        )}
        <div className="kv">
          <Calendar size={16} />
          <span className="num">{fullTime(place.created_at)} 저장</span>
        </div>
        {ref && (
          <div className="kv">
            <ExternalLink size={16} />
            <a href={providerLink(ref.provider, ref.external_id)} target="_blank" rel="noreferrer">
              {providerName(ref.provider)}에서 상세 보기
            </a>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <div className="t-headline">기록</div>
          <span className="t-caption num">메모 {place.note_count}개</span>
        </div>
        {canWrite && (
          <div className="composer">
            <textarea
              placeholder="새로운 기억을 덧붙여 보세요"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote();
              }}
              aria-label="새 메모"
              rows={2}
            />
            <div className="row between">
              <label className="checkbox" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
                <Lock size={13} /> 나만 보기
              </label>
              <button className="btn btn-primary btn-sm" onClick={addNote} disabled={busy || !draft.trim()}>
                <Send size={14} />
                남기기
              </button>
            </div>
          </div>
        )}
        <Timeline
          items={timeline}
          meId={isOwner ? place.owner_id : null}
          editing={editing}
          onEdit={setEditing}
          onRevisions={setRevisionsOf}
          onSaved={async () => {
            setEditing(null);
            await invalidate('timeline', 'place');
          }}
        />
      </div>
      {revisionsOf && <RevisionsModal note={revisionsOf} onClose={() => setRevisionsOf(null)} />}
    </div>
  );
}

function Timeline({
  items,
  meId,
  editing,
  onEdit,
  onRevisions,
  onSaved,
}: {
  items: TimelineItem[];
  meId: string | null;
  editing: Note | null;
  onEdit(n: Note | null): void;
  onRevisions(n: Note): void;
  onSaved(): void;
}) {
  if (!items.length) return null;
  return (
    <div className="timeline" data-testid="timeline">
      {items.map((it) =>
        it.kind === 'note' && it.note ? (
          <div className="tl-item note" key={`n${it.note.id}`}>
            {editing?.id === it.note.id ? (
              <NoteEditor note={it.note} onCancel={() => onEdit(null)} onSaved={onSaved} />
            ) : (
              <>
                <div className="tl-note">{it.note.body}</div>
                <div className="tl-meta">
                  <span className="num" title={fullTime(it.note.noted_at)}>{relTime(it.note.noted_at)}</span>
                  {it.note.author && meId !== it.note.author_id && <span>· {it.note.author.display_name}</span>}
                  {it.note.is_private && (
                    <span className="badge">
                      <Lock size={10} />
                      나만 보기
                    </span>
                  )}
                  {it.note.edited && (
                    <button className="badge" onClick={() => onRevisions(it.note!)} aria-label="수정 이력 보기">
                      <History size={10} />
                      수정됨 · {it.note.revision}
                    </button>
                  )}
                  {meId === it.note.author_id && (
                    <button className="badge" onClick={() => onEdit(it.note!)}>
                      편집
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : it.event ? (
          <div className="tl-item" key={`e${it.event.id}`}>
            <div className="tl-event">{(EVENT_TEXT[it.event.type ?? ''] ?? (() => it.event!.type))(it.event.data ?? {})}</div>
            <div className="tl-meta num">{relTime(it.at)}</div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function NoteEditor({ note, onCancel, onSaved }: { note: Note; onCancel(): void; onSaved(): void }) {
  const [body, setBody] = useState(note.body);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="composer">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="메모 수정" autoFocus rows={3} />
      {err && <div className="field-error">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>취소</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            try {
              await api.patch(`/notes/${note.id}`, { body }, { headers: { 'if-match': `"${note.revision}"` } });
              onSaved();
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}

function RevisionsModal({ note, onClose }: { note: Note; onClose(): void }) {
  const [items, setItems] = useState<(NoteRevision & { current?: boolean })[] | null>(null);
  useEffect(() => {
    api.get<{ items: NoteRevision[] }>(`/notes/${note.id}/revisions`).then((r) => setItems(r.items));
  }, [note.id]);
  return (
    <Modal title="메모 수정 이력" onClose={onClose}>
      <div className="timeline">
        {(items ?? []).map((r) => (
          <div className="tl-item note" key={r.revision}>
            <div className="tl-note">{r.body}</div>
            <div className="tl-meta num">
              버전 {r.revision} · {fullTime(r.edited_at)} {r.current && <span className="badge">현재</span>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

const providerName = (p: string) => ({ kakao: '카카오맵', naver: '네이버 지도', google: 'Google 지도', osm: 'OpenStreetMap' })[p] ?? p;
function providerLink(p: string, id: string) {
  if (p === 'kakao') return `https://place.map.kakao.com/${id}`;
  if (p === 'naver') return `https://map.naver.com/p/entry/place/${id}`;
  if (p === 'google') return `https://www.google.com/maps/place/?q=place_id:${id}`;
  const m = /^([NWR])(\d+)$/.exec(id);
  return m ? `https://www.openstreetmap.org/${{ N: 'node', W: 'way', R: 'relation' }[m[1] as 'N']}/${m[2]}` : '#';
}
