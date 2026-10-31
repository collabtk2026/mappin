'use client';
import type { Category, Icon, MapConfig, Place, PlaceSummary, Share, Tag, TimelineItem } from '@mappin/api-client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface PlaceFilter {
  categoryId?: string | null;
  tagIds?: string[];
  q?: string;
  scope?: 'own' | 'shared' | 'all';
}

export const qk = {
  places: (f: PlaceFilter) => ['places', f] as const,
  place: (id: string) => ['place', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
  categories: ['categories'] as const,
  sharedCategories: ['categories', 'shared'] as const,
  tags: ['tags'] as const,
  icons: ['icons'] as const,
  shares: ['shares'] as const,
  inbox: ['shared-with-me'] as const,
  mapConfig: ['map-config'] as const,
};

export const usePlaces = (f: PlaceFilter) =>
  useQuery({
    queryKey: qk.places(f),
    queryFn: () =>
      api.get<{ items: PlaceSummary[] }>('/places', {
        query: { category_id: f.categoryId ?? undefined, tag: f.tagIds, q: f.q, scope: f.scope ?? 'all', limit: 500 },
      }),
    placeholderData: keepPreviousData,
    select: (d) => d.items,
  });

export const usePlace = (id: string | null) =>
  useQuery({ queryKey: qk.place(id ?? ''), queryFn: () => api.get<Place>(`/places/${id}`), enabled: !!id });

export const useTimeline = (id: string | null) =>
  useQuery({
    queryKey: qk.timeline(id ?? ''),
    queryFn: () => api.get<{ items: TimelineItem[] }>(`/places/${id}/timeline`, { query: { limit: 100 } }),
    enabled: !!id,
    select: (d) => d.items,
  });

export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => api.get<{ items: Category[] }>('/categories'), select: (d) => d.items });
export const useSharedCategories = () =>
  useQuery({ queryKey: qk.sharedCategories, queryFn: () => api.get<{ items: Category[] }>('/categories', { query: { scope: 'shared' } }), select: (d) => d.items });
export const useTags = () => useQuery({ queryKey: qk.tags, queryFn: () => api.get<{ items: Tag[] }>('/tags'), select: (d) => d.items });
export const useIcons = () =>
  useQuery({ queryKey: qk.icons, queryFn: () => api.get<{ items: Icon[] }>('/icons'), select: (d) => d.items, staleTime: Infinity });
export const useShares = () => useQuery({ queryKey: qk.shares, queryFn: () => api.get<{ items: Share[] }>('/shares'), select: (d) => d.items });
export const useInbox = () => useQuery({ queryKey: qk.inbox, queryFn: () => api.get<{ items: Share[] }>('/shared-with-me'), select: (d) => d.items });
export const useMapConfig = () =>
  useQuery({ queryKey: qk.mapConfig, queryFn: () => api.get<MapConfig>('/map/config', { query: { platform: 'web' } }), staleTime: Infinity });

/** 변경 후 관련 캐시 무효화 */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: ('places' | 'place' | 'timeline' | 'categories' | 'tags' | 'shares' | 'shared-with-me')[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/** 카테고리 트리 → id 맵/평탄화 */
export function flattenCategories(tree: Category[] = [], depth = 0, out: (Category & { depth: number })[] = []) {
  for (const c of tree) {
    out.push({ ...c, depth });
    flattenCategories(c.children ?? [], depth + 1, out);
  }
  return out;
}
