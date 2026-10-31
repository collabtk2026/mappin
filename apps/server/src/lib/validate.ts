import { z, type ZodTypeAny } from 'zod';
import { HttpError } from './errors.js';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new HttpError(
      422,
      'VALIDATION_FAILED',
      '입력값을 확인해 주세요',
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export const uuid = z.string().uuid();
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const isoDate = z.string().datetime({ offset: true });
export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/** ?tag=a&tag=b 또는 ?tag=a,b 모두 허용 */
export const idList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).filter(Boolean))
  .pipe(z.array(uuid));

export function parseBBox(s: string): [number, number, number, number] {
  const parts = s.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'bbox 형식은 west,south,east,north 예요');
  }
  return parts as [number, number, number, number];
}

export function parseNear(s: string): { lat: number; lng: number; radius: number | null } {
  const [lat, lng, radius] = s.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'near 형식은 lat,lng[,radius_m] 예요');
  }
  return { lat: lat!, lng: lng!, radius: Number.isFinite(radius) ? radius! : null };
}
