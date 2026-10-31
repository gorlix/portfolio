import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(join(import.meta.dirname, '../../public/_headers'), 'utf8');

// Formato Pages: riga di percorso (senza rientro), poi header rientrati.
const rules: { path: string; headers: Record<string, string> }[] = [];
for (const line of raw.split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: {} });
  else {
    const [name = '', ...value] = line.trim().split(':');
    const current = rules.at(-1);
    if (current) current.headers[name.trim()] = value.join(':').trim();
  }
}
const csp = (path: string) =>
  rules.find((r) => r.path === path)?.headers['Content-Security-Policy'];
const lightPaths = ['/recruiter/*', '/en/recruiter/*', '/agent/*', '/en/agent/*'];
// Ingresso: l'unico percorso leggero con uno script (facoltativo, solo dello stesso sito).
const entrancePaths = ['/', '/en/'];
const heavyPaths = ['/human/*', '/en/human/*'];

describe('_headers', () => {
  it('rispetta i limiti di Pages (100 regole, 2000 caratteri per riga)', () => {
    expect(rules.length).toBeLessThanOrEqual(100);
    for (const line of raw.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });

  it('imposta gli header di sicurezza di base su tutto', () => {
    const all = rules.find((r) => r.path === '/*')?.headers ?? {};
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['Referrer-Policy']).toBeDefined();
    expect(all['Permissions-Policy']).toBeDefined();
    expect(all['X-Frame-Options']).toBe('DENY');
  });

  it('non mette CSP sotto /* (le CSP di piu regole si intersecano) e non ha HSTS', () => {
    expect(rules.find((r) => r.path === '/*')?.headers['Content-Security-Policy']).toBeUndefined();
    expect(raw).not.toMatch(/^\s*Strict-Transport-Security:/m);
  });

  it.each(['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*'])(
    'indirizzo tecnico %s: mai indicizzato',
    (path) => {
      expect(rules.find((r) => r.path === path)?.headers['X-Robots-Tag']).toBe('noindex');
    },
  );

  it('ogni percorso ha una sola regola', () => {
    const paths = rules.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(lightPaths)('percorso leggero %s: nessuno script, nessun dominio esterno', (path) => {
    const value = csp(path) ?? '';
    expect(value).toContain("script-src 'none'");
    expect(value).toContain("default-src 'none'");
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).not.toMatch(/https?:|unsafe-inline|unsafe-eval|\*/);
  });

  it.each(entrancePaths)(
    'ingresso %s: solo lo script dello stesso sito, nulla di esterno',
    (path) => {
      const value = csp(path) ?? '';
      expect(value).toContain("script-src 'self';");
      expect(value).toContain("default-src 'none'");
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).not.toMatch(/https?:|unsafe-inline|unsafe-eval|\*|connect-src/);
    },
  );

  it.each(heavyPaths)('percorso %s: script solo da se stesso e dal beacon di analitica', (path) => {
    const value = csp(path) ?? '';
    expect(value).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(value).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it('cloudflareinsights compare solo nelle regole /human', () => {
    for (const rule of rules) {
      const mentions = Object.values(rule.headers).some((v) => v.includes('cloudflareinsights'));
      expect(mentions, rule.path).toBe(heavyPaths.includes(rule.path));
    }
  });

  it('/admin/*: CMS con script solo del sito, niente eval ne script inline, solo le origini GitHub previste', () => {
    const value = csp('/admin/*') ?? '';
    expect(value).toContain("default-src 'none'");
    expect(value).toContain("script-src 'self';");
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).not.toMatch(/unsafe-eval|\*/);
    // Unici domini esterni ammessi: API GitHub (connect-src) e avatar (img-src), origini esatte.
    expect(value.match(/https?:\/\/[^\s;]+/g)?.sort()).toEqual([
      'https://api.github.com',
      'https://avatars.githubusercontent.com',
    ]);
    expect(value).toMatch(/connect-src [^;]*https:\/\/api\.github\.com(;|$)/);
    expect(value).toMatch(/img-src [^;]*https:\/\/avatars\.githubusercontent\.com(;|$)/);
    // 'unsafe-inline' ammesso solo per gli stili (Sveltia li scrive da script).
    expect(value.replace(/style-src [^;]*;/, '')).not.toContain('unsafe-inline');
    expect(rules.find((r) => r.path === '/admin/*')?.headers['X-Robots-Tag']).toContain('noindex');
  });

  it('/admin/*: COOP same-origin-allow-popups (il popup di login deve poter rispondere al pannello)', () => {
    const h = rules.find((r) => r.path === '/admin/*')?.headers ?? {};
    expect(h['! Cross-Origin-Opener-Policy']).toBeDefined();
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin-allow-popups');
    // Pages unisce i valori: senza il detach il risultato sarebbe invalido.
    expect(rules.find((r) => r.path === '/*')?.headers['Cross-Origin-Opener-Policy']).toBe(
      'same-origin',
    );
  });

  it('le CSP con unsafe-inline o script propri esistono solo per /admin (e /human, /, /en/)', () => {
    for (const rule of rules) {
      const value = rule.headers['Content-Security-Policy'] ?? '';
      if (value.includes("'unsafe-inline'")) expect(rule.path).toBe('/admin/*');
    }
  });

  it.each(['/llms.txt', '/agent.md', '/profile.json', '/robots.txt', '/sitemap.xml'])(
    'file per macchine %s: Content-Type esplicito e CSP chiusa',
    (path) => {
      const h = rules.find((r) => r.path === path)?.headers ?? {};
      expect(h['Content-Type']).toMatch(/charset=utf-8$/);
      expect(h['Content-Security-Policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    },
  );
});
