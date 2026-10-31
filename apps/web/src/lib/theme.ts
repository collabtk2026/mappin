'use client';
import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mappin.theme';

export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 실제 적용 테마(light/dark)와 사용자 설정을 함께 관리 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    let p: ThemePref = 'system';
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark') p = v;
    } catch {}
    setPref(p);
  }, []);
  useEffect(() => {
    const apply = () => {
      const r = pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
      setResolved(r);
      if (pref === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = pref;
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  const set = (p: ThemePref) => {
    setPref(p);
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {}
  };
  const toggle = () => set(resolved === 'dark' ? 'light' : 'dark');
  return { pref, resolved, set, toggle };
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
