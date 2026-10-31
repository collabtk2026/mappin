'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);
  return (
    <AuthShell>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await login(email, password);
            router.replace('/');
          } catch (e) {
            setErr(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <div className="t-display">로그인</div>
          <div className="t-body muted" style={{ marginTop: 6 }}>다시 만나서 반가워요</div>
        </div>
        {err && <div className="error-box" role="alert">{err}</div>}
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
        <div className="row between t-callout">
          <Link href="/signup">회원가입</Link>
          <Link href="/reset-password" className="faint">비밀번호를 잊으셨나요?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
