'use client';
import type { Category, Place, PlaceCreate, PlaceUpdate, Tag } from '@mappin/api-client';
import { resolveIcon } from '@mappin/map-core';
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Glyph, ICON_KEYS, ICONS, IconDot, PALETTE } from '@/lib/icons';
import { flattenCategories, useCategories, useInvalidate, useTags } from '@/lib/queries';
import { useToast } from '@/lib/toast';

export interface Draft {
  title?: string;
  location?: { lat: number; lng: number };
  icon_key?: string | null;
  provider_ref?: PlaceCreate['provider_ref'];
  source?: PlaceCreate['source'];
  address?: string | null;
}

export function IconPicker({ value, color, onChange }: { value: string | null; color: string; onChange(k: string | null): void }) {
  return (
    <div className="icon-grid" role="group" aria-label="아이콘">
      {ICON_KEYS.map((k) => (
        <button
          type="button"
          key={k}
          className="icon-cell"
          aria-pressed={value === k}
          title={ICONS[k]!.label}
          aria-label={ICONS[k]!.label}
          onClick={() => onChange(value === k ? null : k)}
          style={value === k ? { color } : undefined}
        >
          <Glyph k={k} size={20} />
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, onChange }: { value: string | null; onChange(c: string | null): void }) {
  return (
    <div className="swatches" role="group" aria-label="색상">
      {PALETTE.map((c) => (
        <button
          type="button"
          key={c}
          className="swatch"
          aria-pressed={value?.toUpperCase() === c}
          aria-label={c}
          style={{ background: c, color: c }}
          onClick={() => onChange(value?.toUpperCase() === c ? null : c)}
        />
      ))}
    </div>
  );
}

export function CategorySelect({ value, onChange, tree }: { value: string | null; onChange(id: string | null): void; tree: Category[] }) {
  const flat = flattenCategories(tree);
  return (
    <select className="select input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="카테고리">
      <option value="">카테고리 없음</option>
      {flat.map((c) => (
        <option key={c.id} value={c.id}>
          {' '.repeat(c.depth)}
          {c.name}
        </option>
      ))}
    </select>
  );
}

/** 태그 입력: 기존 태그 자동완성 + Enter로 새 태그 */
export function TagInput({ tags, value, onChange }: { tags: Tag[]; value: string[]; onChange(names: string[]): void }) {
  const [text, setText] = useState('');
  const add = (name: string) => {
    const n = name.trim().replace(/^#/, '');
    if (n && !value.some((v) => v.toLowerCase() === n.toLowerCase())) onChange([...value, n]);
    setText('');
  };
  const suggestions = tags.filter((t) => !value.includes(t.name) && (!text || t.name.toLowerCase().includes(text.toLowerCase()))).slice(0, 8);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {value.length > 0 && (
        <div className="chips">
          {value.map((n) => (
            <span key={n} className="chip selected">
              #{n}
              <button type="button" className="x" aria-label={`${n} 태그 빼기`} onClick={() => onChange(value.filter((v) => v !== n))}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        placeholder="태그 입력 후 Enter (예: 데이트)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add(text);
          }
        }}
        aria-label="태그"
      />
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((t) => (
            <button type="button" key={t.id} className="chip small" onClick={() => add(t.name)}>
              <Plus size={12} />
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  mode: 'create' | 'edit';
  draft?: Draft;
  place?: Place;
  defaultCategoryId?: string | null;
  getLocation(): { lat: number; lng: number };
  onCancel(): void;
  onSaved(p: Place): void;
  onPreview?(icon: { key: string; color: string }): void;
}

export function PlaceForm({ mode, draft, place, defaultCategoryId, getLocation, onCancel, onSaved, onPreview }: Props) {
  const { data: tree = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [title, setTitle] = useState(place?.title ?? draft?.title ?? '');
  const [iconKey, setIconKey] = useState<string | null>(place?.icon_key ?? draft?.icon_key ?? null);
  const [color, setColor] = useState<string | null>(place?.color ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(place?.category_id ?? defaultCategoryId ?? null);
  const [tagNames, setTagNames] = useState<string[]>(place?.tags.map((t) => t.name) ?? []);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = useMemo(() => flattenCategories(tree).find((c) => c.id === categoryId) ?? null, [tree, categoryId]);
  const preview = resolveIcon({ icon_key: iconKey, color }, category ? inheritStyle(tree, category.id) : null);
  useEffect(() => onPreview?.({ key: preview.key, color: preview.color }), [preview.key, preview.color]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('이름을 입력해 주세요');
    setBusy(true);
    setError(null);
    try {
      let saved: Place;
      if (mode === 'create') {
        const body: PlaceCreate = {
          title: title.trim(),
          location: getLocation(),
          icon_key: iconKey ?? undefined,
          color: color ?? undefined,
          category_id: categoryId,
          new_tags: tagNames,
          tag_ids: [],
          source: draft?.source ?? 'manual',
          resolve_address: true,
          provider_ref: draft?.provider_ref,
          first_note: note.trim() ? { body: note.trim(), is_private: false } : undefined,
        };
        saved = await api.post<Place>('/places', body, { headers: { 'idempotency-key': crypto.randomUUID() } });
        toast('저장했어요');
      } else {
        const p = place!;
        const loc = getLocation();
        const patch: PlaceUpdate = { title: title.trim(), icon_key: iconKey, color, category_id: categoryId };
        if (Math.abs(loc.lat - p.location.lat) > 1e-7 || Math.abs(loc.lng - p.location.lng) > 1e-7) patch.location = loc;
        saved = await api.patch<Place>(`/places/${p.id}`, patch, { headers: { 'if-match': `"${p.version}"` } });
        // 태그 차이 반영
        const before = new Set(p.tags.map((t) => t.name));
        const after = new Set(tagNames);
        const removed = p.tags.filter((t) => !after.has(t.name));
        const added = tagNames.filter((n) => !before.has(n));
        for (const t of removed) await api.del(`/places/${p.id}/tags/${t.tag_id}`);
        for (const name of added) {
          let tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
          tag ??= await api.post<Tag>('/tags', { name });
          await api.put(`/places/${p.id}/tags/${tag.id}`);
        }
        if (removed.length || added.length) saved = await api.get<Place>(`/places/${p.id}`);
        toast('수정했어요');
      }
      await invalidate('places', 'place', 'timeline', 'tags', 'categories');
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} style={{ gap: 0 }} aria-label={mode === 'create' ? '새 장소' : '장소 수정'}>
      <div className="row form-head">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="뒤로">
          <ArrowLeft size={20} />
        </button>
        <div className="t-headline grow">{mode === 'create' ? '새 장소 저장' : '장소 수정'}</div>
        <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
          <Check size={16} />
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="row" style={{ gap: 12, paddingBottom: 14 }}>
        <IconDot icon={preview} size="lg" />
        <div className="grow">
          <input
            className="input"
            style={{ height: 52, fontSize: 18, fontWeight: 600 }}
            placeholder="장소 이름"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            maxLength={100}
            aria-label="장소 이름"
          />
          {draft?.address && <div className="t-caption" style={{ marginTop: 6 }}>{draft.address}</div>}
        </div>
      </div>
      <div className="t-caption" style={{ paddingBottom: 6 }}>지도를 움직여 핀 위치를 맞출 수 있어요</div>
      {error && <div className="error-box" role="alert">{error}</div>}

      <div className="section">
        <div className="label">카테고리</div>
        <CategorySelect value={categoryId} onChange={setCategoryId} tree={tree} />
      </div>
      <div className="section">
        <div className="section-head">
          <div className="label">아이콘</div>
          {iconKey && <button type="button" className="badge" onClick={() => setIconKey(null)}>카테고리 기본값 사용</button>}
        </div>
        <IconPicker value={iconKey} color={preview.color} onChange={setIconKey} />
        <Swatches value={color} onChange={setColor} />
      </div>
      <div className="section">
        <div className="label">태그</div>
        <TagInput tags={tags} value={tagNames} onChange={setTagNames} />
      </div>
      {mode === 'create' && (
        <div className="section">
          <div className="label">첫 메모</div>
          <textarea className="textarea" placeholder="이곳에 대한 기억을 남겨 보세요" value={note} onChange={(e) => setNote(e.target.value)} aria-label="첫 메모" />
        </div>
      )}
    </form>
  );
}

/** 카테고리의 아이콘/색은 가장 가까운 조상에서 상속 (서버 category_icon과 동일) */
export function inheritStyle(tree: Category[], id: string): { icon_key: string | null; color: string | null } {
  const path: Category[] = [];
  const walk = (nodes: Category[], trail: Category[]): boolean => {
    for (const n of nodes) {
      if (n.id === id) return path.push(...trail, n), true;
      if (walk(n.children ?? [], [...trail, n])) return true;
    }
    return false;
  };
  walk(tree, []);
  const rev = [...path].reverse();
  return { icon_key: rev.find((c) => c.icon_key)?.icon_key ?? null, color: rev.find((c) => c.color)?.color ?? null };
}
