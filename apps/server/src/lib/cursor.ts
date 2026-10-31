import { badRequest } from './errors.js';

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}
export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as T;
  } catch {
    throw badRequest('INVALID_CURSOR', '잘못된 커서예요');
  }
}
