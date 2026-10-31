'use client';
import type { Category, PlaceSummary, Tag } from '@mappin/api-client';
import { MapPinned, Plus, SearchX } from 'lucide-react';
import { relTime } from '@/lib/format';
import { IconDot } from '@/lib/icons';
import { flattenCategories } from '@/lib/queries';
import { Empty, Skeleton } from './ui';

interface Props {
  places: PlaceSummary[] | undefined;
  loading: boolean;
  categories: Category[];
  tags: Tag[];
  categoryId: string | null;
  tagIds: string[];
  filtered: boolean;
  hoverId: string | null;
  onCategory(id: string | null): void;
  onToggleTag(id: string): void;
  onOpen(id: string): void;
  onHover(id: string | null): void;
  onNew(): void;
}

export function PlaceList(p: Props) {
  const flat = flattenCategories(p.categories);
  const catName = (id: string | null | undefined) => flat.find((c) => c.id === id)?.name;
  const tagName = (id: string) => p.tags.find((t) => t.id === id)?.name;
  const roots = p.categories;

  return (
    <div className="stack" style={{ gap: 0 }}>
      {(roots.length > 0 || p.tags.length > 0) && (
        <div className="section" style={{ paddingTop: 6 }}>
          {roots.length > 0 && (
            <div className="chips scroll" role="group" aria-label="카테고리 필터">
              <button className={`chip ${!p.categoryId ? 'selected' : ''}`} onClick={() => p.onCategory(null)}>
                전체
              </button>
              {flat.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${p.categoryId === c.id ? 'selected' : ''}`}
                  onClick={() => p.onCategory(p.categoryId === c.id ? null : c.id)}
                  title={c.depth ? '하위 카테고리' : undefined}
                >
                  <span className="dot" style={{ background: c.color ?? 'var(--text-3)' }} />
                  {c.depth > 0 && <span className="faint">↳</span>}
                  {c.name}
                  <span className="faint num">{c.place_count}</span>
                </button>
              ))}
            </div>
          )}
          {p.tags.length > 0 && (
            <div className="chips scroll" role="group" aria-label="태그 필터">
              {p.tags.map((t) => (
                <button key={t.id} className={`chip small ${p.tagIds.includes(t.id) ? 'selected' : ''}`} onClick={() => p.onToggleTag(t.id)}>
                  #{t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="section" style={{ paddingTop: 8 }}>
        <div className="section-head">
          <div className="t-caption num">{p.places ? `${p.places.length}곳` : ''}</div>
        </div>
        {p.loading && !p.places ? (
          <Skeleton />
        ) : !p.places?.length ? (
          p.filtered ? (
            <Empty icon={<SearchX size={40} strokeWidth={1.5} />} title="조건에 맞는 장소가 없어요" desc="필터를 바꾸거나 검색어를 지워 보세요" />
          ) : (
            <Empty
              icon={<MapPinned size={40} strokeWidth={1.5} />}
              title="아직 저장한 장소가 없어요"
              desc="지도를 길게 누르거나(우클릭) + 버튼으로 첫 장소를 저장해 보세요"
              action={
                <button className="btn btn-primary" onClick={p.onNew}>
                  <Plus size={16} />새 장소
                </button>
              }
            />
          )
        ) : (
          <div className="place-list" data-testid="place-list">
            {p.places.map((pl) => (
              <button
                key={pl.id}
                className={`place-row ${p.hoverId === pl.id ? 'hover' : ''}`}
                onClick={() => p.onOpen(pl.id)}
                onMouseEnter={() => p.onHover(pl.id)}
                onMouseLeave={() => p.onHover(null)}
              >
                <IconDot icon={pl.icon} />
                <div className="grow">
                  <div className="title">{pl.title}</div>
                  <div className="meta">
                    {[
                      pl.via_share_id ? '공유받음' : null,
                      catName(pl.category_id),
                      pl.note_count ? `메모 ${pl.note_count}` : null,
                      relTime(pl.last_noted_at ?? pl.updated_at),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {pl.tag_ids && pl.tag_ids.length > 0 && (
                    <div className="chips" style={{ marginTop: 6 }}>
                      {pl.tag_ids.slice(0, 3).map((id) =>
                        tagName(id) ? (
                          <span key={id} className="chip small">
                            #{tagName(id)}
                          </span>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
