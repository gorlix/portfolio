import { describe, expect, it } from 'vitest';
import type { MachineModel } from '../../src/lib/machine/model';
import { renderAgentMd, renderLlmsTxt, renderProfileJson } from '../../src/lib/machine/render';

const base: MachineModel = {
  name: 'Test Person',
  location: { it: 'Milano', en: 'Milan' },
  email: 'a@example.test',
  links: { github: 'https://g.test/x', linkedin: 'https://l.test/x', x: 'https://x.test/x' },
  pages: [
    {
      id: 'home',
      urls: { it: 'https://site.test/', en: 'https://site.test/en/' },
    },
  ],
  skills: [
    { name: 'Rust', group: { it: 'Linguaggi', en: 'Languages' }, kind: 'technical' },
    { name: 'Go', group: { it: 'Linguaggi', en: 'Languages' }, kind: 'supplementary' },
  ],
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

const complete: MachineModel = {
  ...base,
  role: { it: 'Ruolo', en: 'Role' },
  tagline: { it: 'Frase', en: 'Line' },
  availability: { it: 'Disponibile', en: 'Available' },
};

describe('file per macchine', () => {
  it('llms.txt segue llmstxt.org: H1, blockquote, sezioni di link', () => {
    const out = renderLlmsTxt(complete);
    expect(out.startsWith('# Test Person\n\n> Role · based in Milan · Available\n')).toBe(true);
    expect(out).toMatch(/^## Pages$/m);
    expect(out).toContain('- [P](https://g.test/p): Description');
    expect(out).toContain('Italian: https://site.test/');
  });

  it('senza dati opzionali non emette segnaposto ne campi vuoti', () => {
    for (const out of [renderLlmsTxt(base), renderAgentMd(base), renderProfileJson(base)]) {
      expect(out).not.toMatch(/todo|undefined|null/i);
    }
    expect(renderLlmsTxt(base)).toContain('> Portfolio of Test Person, based in Milan');
    expect(JSON.parse(renderProfileJson(base))).not.toHaveProperty('jobTitle');
  });

  it('agent.md raggruppa le competenze e cita l italiano', () => {
    const out = renderAgentMd(complete);
    expect(out).toContain('- **Languages** _(it: Linguaggi)_: Rust, Go (minor)');
    expect(out).toContain('_it:_ Descrizione');
  });

  it('profile.json e un Person schema.org valido con i campi noti', () => {
    const json = JSON.parse(renderProfileJson(complete));
    expect(json['@type']).toBe('Person');
    expect(json.jobTitle).toBe('Role');
    expect(json.primaryLanguage).toBe('en');
    expect(json.projects[0].description).toEqual({ it: 'Descrizione', en: 'Description' });
  });
});
