import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { Providers } from './providers';

const pretendard = localFont({
  src: '../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  variable: '--font-sans',
  weight: '45 920',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Mappin — 나만의 장소 기록', template: '%s · Mappin' },
  description: '저장한 장소와 그곳에 쌓인 기억을 지도 위에서 다시 보고, 친구와 나눠요.',
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1013' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
