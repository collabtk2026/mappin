'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', display_name: '' });
  const [agree, setAgree] = useState({ all: false, terms: false, privacy: false, location: false, age: false, marketing: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const required = agree.terms && agree.privacy && agree.location && agree.age;
  const setAll = (v: boolean) => setAgree({ all: v, terms: v, privacy: v, location: v, age: v, marketing: v });
  const items = [
    ['terms', '[필수] 서비스 이용약관'],
    ['privacy', '[필수] 개인정보 수집·이용'],
    ['location', '[필수] 위치기반서비스 이용약관'],
    ['age', '[필수] 만 14세 이상이에요'],
    ['marketing', '[선택] 소식 받기'],
  ] as const;
  return (
    <AuthShell>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!required) return setErr('필수 약관에 동의해 주세요');
          setBusy(true);
          setErr(null);
          try {
            await signup({ ...form, marketing: agree.marketing });
            router.replace('/');
          } catch (e) {
            setErr(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <div className="t-display">시작하기</div>
          <div className="t-body muted" style={{ marginTop: 6 }}>1분이면 나만의 지도를 만들 수 있어요</div>
        </div>
        {err && <div className="error-box" role="alert">{err}</div>}
        <div className="field">
          <label htmlFor="name">이름</label>
          <input id="name" className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" className="input" type="password" autoComplete="new-password" minLength={10} placeholder="10자 이상" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div className="card" style={{ gap: 10 }}>
          <label className="checkbox" style={{ fontWeight: 700, color: 'var(--text)' }}>
            <input type="checkbox" checked={agree.all} onChange={(e) => setAll(e.target.checked)} />
            모두 동의
          </label>
          <div className="divider" />
          {items.map(([k, label]) => (
            <label key={k} className="checkbox">
              <input type="checkbox" checked={agree[k]} onChange={(e) => setAgree({ ...agree, [k]: e.target.checked, all: false })} />
              {label}
            </label>
          ))}
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '만드는 중…' : '가입하고 시작하기'}</button>
        <div className="t-callout faint" style={{ textAlign: 'center' }}>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </div>
      </form>
    </AuthShell>
  );
}
