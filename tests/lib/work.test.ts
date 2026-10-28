import { describe, expect, it } from 'vitest';
import { chronological, detailPath, sideAt, splitResult, workTree } from '../../src/lib/work';

const todo = { todo: 'data mancante' };

describe('albero dei lavori', () => {
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

  it('alterna i lati partendo da sinistra', () => {
    expect([0, 1, 2, 3].map(sideAt)).toEqual(['left', 'right', 'left', 'right']);
  });

  it('una foglia per esperienza, con in corso, volontariato e approfondimento', () => {
    const tree = workTree([
      { slug: 'trimind', start: '2026-04', end: null, kind: 'work', detail: 'trimind' },
      { slug: 'club', start: todo, end: todo, kind: 'volunteer' },
      { slug: 'distretto', start: '2026-01', end: '2026-06', kind: 'volunteer' },
    ]);
    expect(tree.leaves).toEqual([
      { slug: 'club', side: 'left', ongoing: false, volunteer: true, detail: false },
      { slug: 'distretto', side: 'right', ongoing: false, volunteer: true, detail: false },
      { slug: 'trimind', side: 'left', ongoing: true, volunteer: false, detail: true },
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
