const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

export function relTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  for (const [unit, sec] of UNITS) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return '방금';
}

export function fullTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

export const initial = (name?: string | null) => (name?.trim()?.[0] ?? '?').toUpperCase();
