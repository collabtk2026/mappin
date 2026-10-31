'use client';
import type { PlaceCandidate } from '@mappin/api-client';
import { useQuery } from '@tanstack/react-query';
import { Globe, MapPin } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Glyph } from '@/lib/icons';

/** 외부 지도 검색 (서버 프록시, 결과는 저장하지 않음) */
export function GeoResults({ q, near, onPick, onOpenSaved }: { q: string; near: { lat: number; lng: number } | null; onPick(c: PlaceCandidate): void; onOpenSaved(id: string): void }) {
  const { data, error, isFetching } = useQuery({
    queryKey: ['geo', q],
    queryFn: () => api.get<{ items: PlaceCandidate[]; attribution: string }>('/geo/search', { query: { q, near: near ? `${near.lat},${near.lng}` : undefined } }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  if (q.trim().length < 2) return null;
  return (
    <div className="section">
      <div className="section-head">
        <div className="row t-callout">
          <Globe size={15} /> 새 장소 찾기
        </div>
        {data?.attribution && <span className="t-caption">{data.attribution}</span>}
      </div>
      {isFetching && !data && <div className="t-caption">찾는 중…</div>}
      {error && <div className="t-caption">{errorMessage(error)}</div>}
      {data && data.items.length === 0 && <div className="t-caption">검색 결과가 없어요</div>}
      <div className="place-list">
        {data?.items.map((c) => (
          <button
            key={`${c.provider_ref?.provider}:${c.provider_ref?.external_id}`}
            className="place-row"
            onClick={() => (c.already_saved_place_id ? onOpenSaved(c.already_saved_place_id) : onPick(c))}
          >
            <span className="icon-dot" style={{ background: 'var(--surface-hover)', color: 'var(--text-2)' }}>
              {c.suggested_icon_key ? <Glyph k={c.suggested_icon_key} size={18} /> : <MapPin size={18} />}
            </span>
            <div className="grow">
              <div className="title">{c.name}</div>
              <div className="meta">{[c.category_label, c.address].filter(Boolean).join(' · ')}</div>
            </div>
            {c.already_saved_place_id && <span className="badge">저장됨</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
