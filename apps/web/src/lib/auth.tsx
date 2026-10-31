'use client';
import type { AuthTokens, Me } from '@mappin/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccess, setAccessToken } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';
interface AuthCtx {
  status: Status;
  me: Me | null;
  setMe(me: Me): void;
  login(email: string, password: string): Promise<void>;
  signup(input: { email: string; password: string; display_name: string; marketing: boolean }): Promise<void>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const CLIENT = { type: 'web' as const, device_name: typeof navigator !== 'undefined' ? navigator.platform : undefined };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    // 새로고침 시 refresh 쿠키로 세션 복원
    refreshAccess().then(async (t) => {
      if (!t) return setStatus('anonymous');
      try {
        setMe(await api.get<Me>('/me'));
        setStatus('authenticated');
      } catch {
        setStatus('anonymous');
      }
    });
  }, []);

  const accept = useCallback((r: AuthTokens) => {
    setAccessToken(r.access_token);
    setMe(r.user);
    setStatus('authenticated');
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      me,
      setMe,
      login: async (email, password) => accept(await api.post<AuthTokens>('/auth/login', { email, password, client: CLIENT })),
      signup: async ({ marketing, ...rest }) =>
        accept(
          await api.post<AuthTokens>('/auth/signup', {
            ...rest,
            client: CLIENT,
            agreements: { terms: true, privacy: true, location: true, age_14_or_over: true, marketing },
          }),
        ),
      logout: async () => {
        await api.post('/auth/logout').catch(() => {});
        setAccessToken(null);
        setMe(null);
        qc.clear();
        setStatus('anonymous');
      },
      deleteAccount: async () => {
        await api.del('/me');
        setAccessToken(null);
        setMe(null);
        qc.clear();
        setStatus('anonymous');
      },
    }),
    [status, me, accept, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
