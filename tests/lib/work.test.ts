import { describe, expect, it } from 'vitest';
import {
  chronological,
  defaultScenery,
  detailPath,
  groupRepos,
  inLavori,
  OPEN_SOURCE_LEVEL,
  splitResult,
  withOpenSource,
  workCourse,
} from '../../src/lib/work';

const todo = { todo: 'data mancante' };

describe('percorso dei lavori', () => {
  it('ordina dal piu vecchio, con le date ignote in fondo all albero', () => {
    const items = [
      { slug: 'b', start: '2026-04' },
      { slug: 'c', start: todo },
      { slug: 'a', start: '2026-01' },
    ];
    expect(chronological(items).map((e) => e.slug)).toEqual(['c', 'a', 'b']);
  });

  it('a parita di data decide lo slug, cosi l ordine e stabile', () => {
    const items = [
      { slug: 'z', start: '2026-01' },
      { slug: 'm', start: '2026-01' },
    ];
    expect(chronological(items).map((e) => e.slug)).toEqual(['m', 'z']);
  });

  it('un livello per esperienza, dalla piu recente, con gli ostacoli dei dati o un default', () => {
    const course = workCourse([
      {
        slug: 'trimind',
        start: '2026-04',
        end: null,
        kind: 'work',
        detail: 'trimind',
        scenery: ['container', 'flag'],
      },
      { slug: 'club', start: todo, end: todo, kind: 'volunteer' },
      { slug: 'distretto', start: '2026-01', end: '2026-06', kind: 'work' },
    ]);
    expect(course.levels).toEqual([
      {
        slug: 'trimind',
        ongoing: true,
        volunteer: false,
        detail: true,
        scenery: ['container', 'flag'],
      },
      {
        slug: 'distretto',
        ongoing: false,
        volunteer: false,
        detail: false,
        scenery: defaultScenery('work'),
      },
      {
        slug: 'club',
        ongoing: false,
        volunteer: true,
        detail: false,
        scenery: defaultScenery('volunteer'),
      },
    ]);
  });

  it('percorso della pagina di approfondimento', () => {
    expect(detailPath('trimind')).toBe('/human/lavori/trimind');
  });
});

describe('punti del CV', () => {
  it('separa l etichetta iniziale dal testo', () => {
    expect(splitResult('Qualità: circa 490 test automatici.')).toEqual({
      label: 'Qualità',
      text: 'circa 490 test automatici.',
    });
  });

  it('senza etichetta breve resta tutto testo', () => {
    expect(splitResult('Gestione autonoma di hosting, DNS e manutenzione.')).toEqual({
      text: 'Gestione autonoma di hosting, DNS e manutenzione.',
    });
    const long = `${'parola '.repeat(10)}: resto`;
    expect(splitResult(long)).toEqual({ text: long });
  });
});

describe('esperienze fuori dai Lavori', () => {
  it('una esperienza di Beneficenza non entra nei livelli dei Lavori', () => {
    const items = [
      { slug: 'lavoro', start: '2026-01', humanSection: 'lavori' as const },
      { slug: 'club', start: '2025-01', humanSection: 'beneficenza' as const },
    ];
    const course = workCourse(
      inLavori(items).map((e) => ({ ...e, end: null, kind: 'work' as const })),
    );
    expect(course.levels.map((l) => l.slug)).toEqual(['lavoro']);
  });
});

describe('tappa e pagina Open source', () => {
  const entry = (name: string, group: 'paca' | 'hardware', stars: number) => ({
    name,
    repo: `https://github.com/gorlix/${name}`,
    language: 'Go',
    openSource: { group, description: 'd', stars, contribution: false },
  });
  const groups = [
    { id: 'hardware', title: 'H' },
    { id: 'paca', title: 'P' },
    { id: 'portfolio', title: 'Q' },
  ] as const;

  it('la tappa chiude il percorso, dopo le esperienze', () => {
    const course = withOpenSource({ levels: [] });
    expect(course.levels.map((l) => l.slug)).toEqual([OPEN_SOURCE_LEVEL]);
    expect(course.levels[0]).toMatchObject({ detail: true, scenery: ['skyline'] });
  });

  it('segue i gruppi dei dati, ordina per stelle vive, toglie i gruppi vuoti', () => {
    const out = groupRepos(
      groups,
      [
        entry('a', 'paca', 1),
        entry('b', 'paca', 9),
        entry('c', 'hardware', 2),
        { name: 'fuori', language: todo },
      ],
      new Map([['https://github.com/gorlix/a', 50]]),
    );
    expect(out.map((g) => g.id)).toEqual(['hardware', 'paca']);
    expect(out[1]?.repos.map((r) => [r.name, r.stars])).toEqual([
      ['a', 50],
      ['b', 9],
    ]);
  });

  it('un repository incompleto ferma la build', () => {
    const none = new Map<string, number>();
    expect(() =>
      groupRepos(groups, [{ ...entry('a', 'paca', 1), repo: undefined }], none),
    ).toThrow();
    expect(() =>
      groupRepos(groups, [{ ...entry('a', 'paca', 1), language: todo }], none),
    ).toThrow();
    expect(() => groupRepos([groups[0]], [entry('a', 'paca', 1)], none)).toThrow();
  });
});
