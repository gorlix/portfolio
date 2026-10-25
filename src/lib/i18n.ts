import { type Locale, locales } from './schemas/common';

export const defaultLocale: Locale = 'it';
export const siteUrl = 'https://alessandrogorla.it';

/**
 * Percorso di una pagina nella lingua data: IT senza prefisso, EN sotto `/en`.
 * Tutti gli URL terminano con `/` (come li serve Cloudflare Pages per `dir/index.html`).
 * Input: `/` o `/recruiter` (con o senza `/` finale).
 */
export function localizedPath(path: string, locale: Locale): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const tail = clean ? `${clean}/` : '';
  return locale === defaultLocale ? `/${tail}` : `/en/${tail}`;
}

export const absoluteUrl = (path: string): string => new URL(path, siteUrl).toString();

/** Alternate hreflang di una pagina (una voce per lingua, piu `x-default` = lingua di default). */
export function alternates(path: string): { hreflang: string; href: string }[] {
  const entries = locales.map((l) => ({ hreflang: l, href: absoluteUrl(localizedPath(path, l)) }));
  return [
    ...entries,
    { hreflang: 'x-default', href: absoluteUrl(localizedPath(path, defaultLocale)) },
  ];
}

/**
 * Per le pagine `src/pages/[...lang]/…astro`: genera il percorso IT (senza prefisso) e quello EN.
 * Una sola sorgente per pagina garantisce la gemella nell'altra lingua.
 */
export function localeStaticPaths() {
  return locales.map((locale) => ({
    params: { lang: locale === defaultLocale ? undefined : locale },
    props: { locale },
  }));
}
