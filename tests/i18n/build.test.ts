import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'astro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
// Dentro il repo (non in /tmp): Astro sposta gli asset con rename, che non attraversa i filesystem.
const outDir = join(root, 'node_modules/.cache/test-dist');
const site = 'https://alessandrogorla.it';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// Pagina HTML -> URL pubblico (con slash finale).
const urlOf = (file: string) => `/${relative(outDir, file).replace(/index\.html$/, '')}`;
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

let pages: { url: string; html: string }[] = [];

beforeAll(async () => {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await build({ root, outDir, logLevel: 'error' });
  pages = walk(outDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ url: urlOf(f), html: readFileSync(f, 'utf8') }));
}, 60_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('build i18n', () => {
  it('genera almeno una pagina e ognuna ha la gemella nell altra lingua', () => {
    expect(pages.length).toBeGreaterThan(0);
    const urls = new Set(pages.map((p) => p.url));
    for (const { url } of pages) {
      const twin = url.startsWith('/en/') ? url.replace(/^\/en/, '') : `/en${url}`;
      expect(urls.has(twin), `${url} senza gemella ${twin}`).toBe(true);
    }
  });

  it('ogni pagina ha lang, canonical su se stessa e alternate hreflang reciproci', () => {
    for (const { url, html } of pages) {
      const isEn = url.startsWith('/en/');
      expect(html, url).toContain(`<html lang="${isEn ? 'en' : 'it'}"`);

      const links = [...html.matchAll(/<link [^>]*>/g)].map((m) => m[0]);
      const canonical = links.find((l) => attr(l, 'rel') === 'canonical');
      expect(attr(canonical ?? '', 'href'), url).toBe(`${site}${url}`);

      const alts = Object.fromEntries(
        links
          .filter((l) => attr(l, 'rel') === 'alternate')
          .map((l) => [attr(l, 'hreflang'), attr(l, 'href')]),
      );
      const itUrl = isEn ? url.replace(/^\/en/, '') : url;
      expect(alts, url).toEqual({
        it: `${site}${itUrl}`,
        en: `${site}/en${itUrl}`,
        'x-default': `${site}${itUrl}`,
      });
    }
  });

  it('il selettore lingua e fatto di link e non emette JavaScript', () => {
    for (const { url, html } of pages) {
      expect(html, url).not.toContain('<script');
      expect(html, url).toMatch(/<a href="[^"]*" hreflang="it"/);
      expect(html, url).toMatch(/<a href="[^"]*" hreflang="en"/);
    }
  });
});
