import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080';

export default {
  reactStrictMode: true,
  // Docker 운영 이미지용: 필요한 파일만 담은 standalone 서버
  output: 'standalone',
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  poweredByHeader: false,
  transpilePackages: ['@mappin/api-client', '@mappin/map-core'],
  async rewrites() {
    // 같은 출처로 API를 프록시 → refresh 쿠키(HttpOnly, path=/v1/auth)가 그대로 동작
    return [{ source: '/v1/:path*', destination: `${API_URL}/v1/:path*` }];
  },
};
