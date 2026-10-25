import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { MachineModel } from '../../src/lib/machine/model';
import { renderAgentMd, renderLlmsTxt, renderProfileJson } from '../../src/lib/machine/render';
import { renderRobotsTxt } from '../../src/lib/machine/robots';
import { renderSitemapXml } from '../../src/lib/machine/sitemap';
import {
  scanText,
  validateAgentMd,
  validateLlmsTxt,
  validateProfileJson,
  validateRobotsTxt,
  validateSitemapXml,
} from '../../src/lib/machine/validate';

const model: MachineModel = {
  name: 'Test Person',
  role: { it: 'Ruolo', en: 'Role' },
  location: { it: 'Milano', en: 'Milan' },
  email: 'a@example.test',
  links: { github: 'https://g.test/x', linkedin: 'https://l.test/x', x: 'https://x.test/x' },
  pages: [
    {
      id: 'home',
      urls: { it: 'https://alessandrogorla.it/', en: 'https://alessandrogorla.it/en/' },
    },
  ],
  certifications: [],
  skills: [{ name: 'Rust', group: { it: 'Linguaggi', en: 'Languages' }, kind: 'technical' }],
  projects: [
    {
      slug: 'p',
      name: 'P',
      repo: 'https://g.test/p',
      description: { it: 'Descrizione', en: 'Description' },
      featured: true,
    },
  ],
};

const files = {
  'llms.txt': renderLlmsTxt(model),
  'agent.md': renderAgentMd(model),
  'profile.json': renderProfileJson(model),
  'robots.txt': renderRobotsTxt(),
  'sitemap.xml': renderSitemapXml(['/']),
};

describe('validatori: verdi sui file generati', () => {
  it('nessun problema', () => {
    expect(validateLlmsTxt(files['llms.txt'])).toEqual([]);
    expect(validateAgentMd(files['agent.md'])).toEqual([]);
    expect(validateProfileJson(files['profile.json'])).toEqual([]);
    expect(validateRobotsTxt(files['robots.txt'])).toEqual([]);
    expect(validateSitemapXml(files['sitemap.xml'])).toEqual([]);
  });
});

describe('validatori: rossi su file manomessi', () => {
  it('profile.json', () => {
    const json = JSON.parse(files['profile.json']);
    expect(validateProfileJson('{ rotto')[0]).toContain('JSON non valido');
    expect(validateProfileJson(JSON.stringify({ ...json, '@type': 'Organization' }))).not.toEqual(
      [],
    );
    expect(validateProfileJson(JSON.stringify({ ...json, sameAs: ['http://x.test'] }))).not.toEqual(
      [],
    );
    expect(validateProfileJson(JSON.stringify({ ...json, extra: 1 }))).not.toEqual([]);
  });

  it('llms.txt', () => {
    expect(validateLlmsTxt(files['llms.txt'].replace(/^# .*\n/, ''))).not.toEqual([]);
    expect(validateLlmsTxt(files['llms.txt'].replace(/^> .*\n/m, ''))).not.toEqual([]);
    expect(validateLlmsTxt(`${files['llms.txt']}- voce senza link\n`)).not.toEqual([]);
  });

  it('agent.md, robots.txt', () => {
    expect(validateAgentMd(files['agent.md'].replace('## Contact', '## Altro'))).not.toEqual([]);
    expect(validateRobotsTxt(`${files['robots.txt']}\nDisallow: /\n`)).not.toEqual([]);
    expect(validateRobotsTxt(files['robots.txt'].replace(/^Sitemap:.*$/m, ''))).not.toEqual([]);
  });

  it('sitemap.xml', () => {
    expect(validateSitemapXml(files['sitemap.xml'].replace('</urlset>', ''))[0]).toContain('XML');
    expect(
      validateSitemapXml(files['sitemap.xml'].replaceAll('hreflang="en"', 'hreflang="fr"')),
    ).not.toEqual([]);
    expect(
      validateSitemapXml(
        files['sitemap.xml'].replaceAll('https://alessandrogorla.it', 'http://x.test'),
      ),
    ).not.toEqual([]);
  });
});

describe('scanner', () => {
  const rules = (text: string) => scanText(text).map((f) => f.rule);

  it.each([
    '10.0.0.5',
    '172.16.4.2',
    '172.31.255.1',
    '192.168.1.10',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    'fd12:3456:789a::1',
  ])('segnala l IP privato %s', (addr) =>
    expect(rules(`host ${addr} qui`)).toEqual(['ip-privato']),
  );

  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '11.0.0.1', '1.10.0.5', 'v1.2.3.4.5'])(
    'non segnala %s',
    (addr) => expect(rules(`x ${addr} y`)).toEqual([]),
  );

  it('ammette solo apex e www per il dominio del sito', () => {
    expect(rules('https://alessandrogorla.it/ https://www.alessandrogorla.it/en/')).toEqual([]);
    expect(rules('https://nas.alessandrogorla.it/')).toEqual(['host-non-ammesso']);
    expect(rules('https://a.b.AlessandroGorla.it/')).toEqual(['host-non-ammesso']);
    expect(rules('server.home.arpa pve01.lan db.internal')).toEqual(
      Array(3).fill('host-non-ammesso'),
    );
  });
});

describe('script check:machine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'machine-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(import.meta.dirname, '../../scripts/validate-machine.ts');
  const run = () => spawnSync('node', [script, dir], { encoding: 'utf8' });

  it('verde su una build valida, rosso se un file e manomesso o contiene un host privato', () => {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    expect(run().status).toBe(0);

    writeFileSync(join(dir, 'index.html'), '<a href="https://nas.alessandrogorla.it/">x</a>');
    const leak = run();
    expect(leak.status).toBe(1);
    expect(leak.stderr).toContain('host-non-ammesso');
    rmSync(join(dir, 'index.html'));

    writeFileSync(join(dir, 'sitemap.xml'), '<urlset>');
    expect(run().status).toBe(1);
  });
});
