import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'astro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateJsonLd } from '../../src/lib/machine/validate';

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

  it('e compatibile con la CSP dei percorsi leggeri: niente script, stili o attributi style inline', () => {
    for (const { url, html } of pages) {
      expect(html, url).not.toMatch(/<style[\s>]/);
      expect(html, url).not.toMatch(/\sstyle="/);
      expect(html, url).not.toMatch(/\son[a-z]+="/);
    }
  });

  it('il selettore lingua e fatto di link; script solo esterni: uno in ingresso, due su /human', () => {
    for (const { url, html } of pages) {
      // Il JSON-LD e un blocco di dati, non codice: non conta tra gli script.
      const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)]
        .map((m) => m[0])
        .filter((tag) => !tag.startsWith('<script type="application/ld+json">'));
      // Ingresso: terminale. Percorso Umano: bootstrap 3D e barra del tempo. Altrove nessuno.
      const expected: Record<string, number> = { '/': 1, '/en/': 1, '/human/': 2, '/en/human/': 2 };
      expect(scripts.length, url).toBe(expected[url] ?? 0);
      for (const tag of scripts) {
        expect(tag, url).toMatch(/^<script type="module" src="\/_astro\/[^"]+\.js"><\/script>$/);
      }
      expect(html, url).toMatch(/<a href="[^"]*" hreflang="it"/);
      expect(html, url).toMatch(/<a href="[^"]*" hreflang="en"/);
    }
  });
});

describe('build SEO', () => {
  const meta = (html: string, key: 'name' | 'property', value: string) =>
    [...html.matchAll(/<meta [^>]*>/g)]
      .map((m) => m[0])
      .find((t) => attr(t, key) === value && attr(t, 'content'))
      ?.match(/content="([^"]*)"/)?.[1];

  it('ogni pagina ha title, description e Open Graph coerenti', () => {
    for (const { url, html } of pages) {
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = meta(html, 'name', 'description');
      expect(title, url).toBeTruthy();
      expect(description, url).toBeTruthy();
      expect(meta(html, 'property', 'og:title'), url).toBe(title);
      expect(meta(html, 'property', 'og:description'), url).toBe(description);
      expect(meta(html, 'property', 'og:url'), url).toBe(`${site}${url}`);
      expect(meta(html, 'property', 'og:locale'), url).toBe(
        url.startsWith('/en/') ? 'en_US' : 'it_IT',
      );
    }
  });

  it('la sitemap elenca esattamente le pagine generate', () => {
    const xml = readFileSync(join(outDir, 'sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    expect(locs).toEqual(pages.map((p) => `${site}${p.url}`).sort());
  });

  it('robots.txt dichiara la sitemap e chiude /admin', () => {
    const robots = readFileSync(join(outDir, 'robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${site}/sitemap.xml`);
    expect(robots).toContain('Disallow: /admin');
  });
});

describe('vetrina /agent', () => {
  const decodeHtml = (t: string) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');

  /** Testo dentro `<pre data-file="nome"...><code>...</code></pre>`. */
  const shownFile = (html: string, name: string) => {
    const open = html.indexOf(`data-file="${name}"`);
    if (open < 0) return undefined;
    const start = html.indexOf('>', html.indexOf('<code', open)) + 1;
    return decodeHtml(html.slice(start, html.indexOf('</code></pre>', start)));
  };

  for (const url of ['/agent/', '/en/agent/']) {
    it(`${url} mostra i file della root byte per byte`, () => {
      const html = pages.find((p) => p.url === url)?.html ?? '';
      expect(html, url).not.toBe('');
      for (const name of ['llms.txt', 'profile.json', 'agent.md']) {
        expect(shownFile(html, name), `${url} ${name}`).toBe(
          readFileSync(join(outDir, name), 'utf8'),
        );
      }
    });
  }
});

describe('peso immagini', () => {
  it('nessuna immagine ottimizzata supera 100 KB (spec 3.5, prima vista leggera)', () => {
    const images = walk(outDir).filter((f) => /\.(webp|avif|jpe?g|png|gif)$/i.test(f));
    for (const f of images) {
      expect(statSync(f).size, relative(outDir, f)).toBeLessThanOrEqual(100 * 1024);
    }
  });
});

describe('JSON-LD', () => {
  it('ogni pagina HTML ha un JSON-LD valido, nella lingua della pagina', () => {
    for (const { url, html } of pages) {
      expect(validateJsonLd(html), url).toEqual([]);
      const lang = url.startsWith('/en/') ? 'en' : 'it';
      expect(html, url).toContain(`"inLanguage":"${lang}"`);
    }
  });
});
