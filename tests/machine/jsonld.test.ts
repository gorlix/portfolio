import { describe, expect, it } from 'vitest';
import { buildJsonLd, serializeJsonLd } from '../../src/lib/machine/jsonld';
import type { MachineModel } from '../../src/lib/machine/model';
import { validateJsonLd } from '../../src/lib/machine/validate';

const model: MachineModel = {
  name: 'Test Person',
  role: { it: 'Ruolo', en: 'Role' },
  location: { it: 'Milano', en: 'Milan' },
  tagline: { it: 'Frase', en: 'Line' },
  email: 'a@example.test',
  links: { github: 'https://g.test/x', linkedin: 'https://l.test/x', x: 'https://x.test/x' },
  pages: [
    {
      id: 'home',
      urls: { it: 'https://alessandrogorla.it/', en: 'https://alessandrogorla.it/en/' },
    },
  ],
  skills: [{ name: 'Rust', group: { it: 'Linguaggi', en: 'Languages' }, kind: 'technical' }],
  certifications: [
    { name: 'Cert', issuer: 'Ente', date: '2024-03', verifyUrl: 'https://v.test/c' },
    { name: 'Solo nome' },
  ],
  projects: [
    {
      slug: 'p',
      name: 'P',
      repo: 'https://g.test/p',
      description: { it: 'Descrizione', en: 'Description' },
      language: 'Rust',
      featured: true,
    },
  ],
};

const html = (data: unknown) =>
  `<script type="application/ld+json">${serializeJsonLd(data)}</script>`;
const page = { locale: 'en', path: '/recruiter', name: 'T', type: 'ProfilePage' } as const;

describe('JSON-LD', () => {
  it('produce un grafo valido con testi nella lingua della pagina', () => {
    const data = buildJsonLd(model, page);
    expect(validateJsonLd(html(data))).toEqual([]);
    const text = JSON.stringify(data);
    expect(text).toContain('"jobTitle":"Role"');
    expect(text).toContain('"description":"Description"');
    expect(text).toContain('"@id":"https://alessandrogorla.it/en/recruiter/#page"');
    expect(JSON.stringify(buildJsonLd(model, { ...page, locale: 'it' }))).toContain(
      '"jobTitle":"Ruolo"',
    );
  });

  it('omette i dati non noti invece di emettere segnaposto', () => {
    const bare = { ...model, role: undefined, tagline: undefined, certifications: [] };
    const data = JSON.stringify(buildJsonLd(bare, page));
    expect(data).not.toMatch(/jobTitle|hasCredential|todo|undefined|null/);
    expect(validateJsonLd(html(buildJsonLd(bare, page)))).toEqual([]);
  });

  it('serializza in modo sicuro dentro uno script', () => {
    expect(serializeJsonLd({ a: '</script><b>' })).not.toContain('<');
  });

  it('il validatore rifiuta blocchi mancanti, riferimenti rotti e segnaposto', () => {
    expect(validateJsonLd('<html></html>')).not.toEqual([]);
    const data = buildJsonLd(model, page) as { '@graph': { mainEntity?: { '@id': string } }[] };
    const broken = structuredClone(data);
    (broken['@graph'][0] as { mainEntity: { '@id': string } }).mainEntity['@id'] =
      'https://alessandrogorla.it/#nope';
    expect(validateJsonLd(html(broken)).join()).toContain('non risolto');
    const todo = JSON.parse(JSON.stringify(data));
    todo['@graph'][1].name = 'TODO(Alessandro)';
    expect(validateJsonLd(html(todo)).join()).toContain('todo');
  });
});
