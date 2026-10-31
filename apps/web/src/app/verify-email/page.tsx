'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { api, errorMessage } from '@/lib/api';

export default function VerifyEmail() {
  const [state, setState] = useState<'pending' | 'ok' | string>('pending');
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token') ?? '';
    api.post('/auth/email/verify', { token }).then(() => setState('ok'), (e) => setState(errorMessage(e)));
  }, []);
  return (
    <AuthShell>
      <div className="auth-card">
        <div className="t-display">{state === 'ok' ? '인증했어요' : state === 'pending' ? '확인 중…' : '인증할 수 없어요'}</div>
        {state !== 'ok' && state !== 'pending' && <div className="error-box">{state}</div>}
        <Link className="btn btn-primary btn-block" href="/">지도로 가기</Link>
      </div>
    </AuthShell>
  );
}
