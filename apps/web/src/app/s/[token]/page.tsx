import type { PublicShareView } from '@mappin/api-client';
import type { Metadata } from 'next';
import { SharedView } from '@/components/SharedView';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080';

async function load(token: string): Promise<{ data?: PublicShareView; status: number }> {
  const res = await fetch(`${API_URL}/v1/public/shares/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) return { status: res.status };
  return { status: 200, data: (await res.json()) as PublicShareView };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { data } = await load((await params).token);
  if (!data) return { title: '공유를 찾을 수 없어요', robots: { index: false } };
  const title = `${data.share?.owner?.display_name}님의 ${data.share?.title}`;
  const desc = `장소 ${data.places?.length ?? 0}곳 · Mappin에서 함께 보기`;
  return { title, description: desc, robots: { index: false }, openGraph: { title, description: desc, type: 'website' } };
}

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { data, status } = await load((await params).token);
  return <SharedView data={data ?? null} status={status} />;
}
