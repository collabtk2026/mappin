'use client';
import type { Category } from '@mappin/api-client';
import { FolderPlus, FolderTree, Pencil, Plus, Share2, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Glyph } from '@/lib/icons';
import { useCategories, useInvalidate } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { inheritStyle, IconPicker, Swatches } from './PlaceForm';
import { Empty, Modal, Skeleton } from './ui';

export function CategoryManager({ onShare, onPick }: { onShare(c: Category): void; onPick(c: Category): void }) {
  const { data: tree, isLoading } = useCategories();
  const [editing, setEditing] = useState<{ cat?: Category; parentId?: string | null } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  if (isLoading || !tree) return <Skeleton rows={3} />;

  const render = (nodes: Category[], depth: number): React.ReactNode =>
    nodes.map((c) => {
      const style = inheritStyle(tree, c.id);
      return (
        <div key={c.id}>
          <div className="tree-row" style={{ paddingLeft: 6 + depth * 20 }}>
            <span className="icon-dot sm" style={{ background: style.color ?? '#5B6B7F' }}>
              <Glyph k={style.icon_key ?? 'pin.default'} size={15} />
            </span>
            <button className="name" onClick={() => onPick(c)} title="이 카테고리만 지도에 보기">
              {c.name}
            </button>
            {c.shared && <Users size={14} className="faint" aria-label="공유 중" />}
            <span className="t-caption num">{c.place_count}</span>
            <div className="tools">
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`${c.name}에 하위 카테고리`} onClick={() => setEditing({ parentId: c.id })}>
                <Plus size={16} />
              </button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`${c.name} 수정`} onClick={() => setEditing({ cat: c })}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`${c.name} 공유`} onClick={() => onShare(c)}>
                <Share2 size={15} />
              </button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`${c.name} 삭제`} onClick={() => setDeleting(c)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {c.children && c.children.length > 0 && render(c.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="section" style={{ paddingTop: 6 }}>
        <div className="section-head">
          <div className="t-headline">카테고리</div>
          <button className="btn btn-sm" onClick={() => setEditing({ parentId: null })}>
            <FolderPlus size={15} />
            새 카테고리
          </button>
        </div>
        {tree.length === 0 ? (
          <Empty icon={<FolderTree size={40} strokeWidth={1.5} />} title="카테고리로 장소를 묶어 보세요" desc="맛집 › 서울 › 성수처럼 단계별로 만들 수 있어요" />
        ) : (
          <div className="tree" data-testid="category-tree">{render(tree, 0)}</div>
        )}
      </div>
      {editing && <CategoryEditor {...editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCategory cat={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function CategoryEditor({ cat, parentId, onClose }: { cat?: Category; parentId?: string | null; onClose(): void }) {
  const [name, setName] = useState(cat?.name ?? '');
  const [icon, setIcon] = useState<string | null>(cat?.icon_key ?? null);
  const [color, setColor] = useState<string | null>(cat?.color ?? null);
  const [err, setErr] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();
  const save = async () => {
    try {
      if (cat) await api.patch(`/categories/${cat.id}`, { name, icon_key: icon, color });
      else await api.post('/categories', { name, icon_key: icon, color, parent_id: parentId ?? null });
      await invalidate('categories', 'places', 'place');
      toast(cat ? '카테고리를 수정했어요' : '카테고리를 만들었어요');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Modal
      title={cat ? '카테고리 수정' : parentId ? '하위 카테고리 만들기' : '새 카테고리'}
      onClose={onClose}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            저장
          </button>
        </div>
      }
    >
      <div className="field">
        <label htmlFor="cat-name">이름</label>
        <input id="cat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={50} placeholder="예: 맛집" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim() && save()} />
      </div>
      <div className="field">
        <label>기본 아이콘 <span className="faint">(비우면 상위 카테고리를 따라가요)</span></label>
        <IconPicker value={icon} color={color ?? '#5B6B7F'} onChange={setIcon} />
      </div>
      <div className="field">
        <label>색상</label>
        <Swatches value={color} onChange={setColor} />
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

function DeleteCategory({ cat, onClose }: { cat: Category; onClose(): void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [mode, setMode] = useState<'move_to_parent' | 'uncategorize' | 'delete'>('move_to_parent');
  return (
    <Modal
      title={`'${cat.name}' 삭제`}
      onClose={onClose}
      footer={
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await api.del(`/categories/${cat.id}`, { query: { places: mode } });
              await invalidate('categories', 'places', 'place', 'shares');
              toast('카테고리를 삭제했어요');
              onClose();
            }}
          >
            삭제
          </button>
        </div>
      }
    >
      <div className="t-body muted">하위 카테고리도 함께 삭제돼요. 안에 있는 장소 {cat.place_count}곳은 어떻게 할까요?</div>
      <div className="stack" style={{ gap: 10 }}>
        {(
          [
            ['move_to_parent', cat.parent_id ? '상위 카테고리로 옮기기' : '카테고리 없음으로 두기'],
            ['uncategorize', '카테고리 없음으로 두기'],
            ['delete', '장소도 휴지통으로 보내기'],
          ] as const
        )
          .filter(([k]) => !(k === 'uncategorize' && !cat.parent_id))
          .map(([k, label]) => (
            <label key={k} className="checkbox">
              <input type="radio" name="del-mode" checked={mode === k} onChange={() => setMode(k)} />
              {label}
            </label>
          ))}
      </div>
    </Modal>
  );
}
