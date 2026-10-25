import type { Locale } from './schemas/common';

/** `YYYY-MM` o `YYYY-MM-DD` nella lingua data (es. "mar 2024"), calcolato a build time. */
export function formatDate(iso: string, locale: Locale): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', month: 'short' };
  if (iso.length > 7) options.day = 'numeric';
  return new Intl.DateTimeFormat(locale, options).format(date);
}
