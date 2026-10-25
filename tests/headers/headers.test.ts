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

  it.each(['/llms.txt', '/agent.md', '/profile.json', '/robots.txt', '/sitemap.xml'])(
    'file per macchine %s: Content-Type esplicito e CSP chiusa',
    (path) => {
      const h = rules.find((r) => r.path === path)?.headers ?? {};
      expect(h['Content-Type']).toMatch(/charset=utf-8$/);
      expect(h['Content-Security-Policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    },
  );
});
