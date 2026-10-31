'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MapApp } from '@/components/MapApp';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);
  if (status !== 'authenticated') return <div className="app" style={{ background: 'var(--bg)' }} aria-busy="true" />;
  return <MapApp />;
}
