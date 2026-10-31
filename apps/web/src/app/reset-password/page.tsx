'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { api, errorMessage } from '@/lib/api';

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setToken(new URLSearchParams(location.search).get('token')), []);
  return (
    <AuthShell>
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            if (token) {
              await api.post('/auth/password/reset', { token, new_password: pw });
              setMsg('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.');
            } else {
              await api.post('/auth/password/forgot', { email });
              setMsg('메일을 보냈어요. 받은편지함을 확인해 주세요.');
            }
          } catch (e) {
            setErr(errorMessage(e));
          }
        }}
      >
        <div className="t-display">{token ? '새 비밀번호' : '비밀번호 찾기'}</div>
        {msg && <div className="card t-callout">{msg}</div>}
        {err && <div className="error-box">{err}</div>}
        {token ? (
          <div className="field">
            <label htmlFor="pw">새 비밀번호</label>
            <input id="pw" className="input" type="password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="email">가입한 이메일</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}
        <button className="btn btn-primary btn-block">{token ? '바꾸기' : '재설정 메일 받기'}</button>
        <Link href="/login" className="t-callout" style={{ textAlign: 'center' }}>로그인으로 돌아가기</Link>
      </form>
    </AuthShell>
  );
}
