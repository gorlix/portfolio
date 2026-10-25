import { describe, expect, it } from 'vitest';
import { absoluteUrl, alternates, localeStaticPaths, localizedPath } from '../../src/lib/i18n';

describe('localizedPath', () => {
  it('IT senza prefisso, EN sotto /en, sempre con slash finale', () => {
    expect(localizedPath('/', 'it')).toBe('/');
    expect(localizedPath('/', 'en')).toBe('/en/');
    expect(localizedPath('/recruiter', 'it')).toBe('/recruiter/');
    expect(localizedPath('/recruiter/', 'en')).toBe('/en/recruiter/');
  });
});

describe('alternates', () => {
  it('elenca it, en e x-default (= IT) con URL assoluti', () => {
    expect(alternates('/recruiter')).toEqual([
      { hreflang: 'it', href: 'https://alessandrogorla.it/recruiter/' },
      { hreflang: 'en', href: 'https://alessandrogorla.it/en/recruiter/' },
      { hreflang: 'x-default', href: 'https://alessandrogorla.it/recruiter/' },
    ]);
  });

  it('absoluteUrl usa solo il dominio del sito', () => {
    expect(absoluteUrl('/x/')).toBe('https://alessandrogorla.it/x/');
  });
});

describe('localeStaticPaths', () => {
  it('genera una pagina per lingua, IT senza parametro', () => {
    expect(localeStaticPaths()).toEqual([
      { params: { lang: undefined }, props: { locale: 'it' } },
      { params: { lang: 'en' }, props: { locale: 'en' } },
    ]);
  });
});
