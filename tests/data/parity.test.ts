import { describe, expect, it } from 'vitest';
import { diffLocales } from '../../src/lib/data/parity';

const tr = ['title', 'items.*'];

describe('diffLocales', () => {
  it('accetta traduzioni con struttura identica e non traducibili uguali', () => {
    const it_ = { title: 'Ciao', url: 'https://x.test', items: ['a'] };
    const en = { title: 'Hello', url: 'https://x.test', items: ['b'] };
    expect(diffLocales(it_, en, tr)).toEqual([]);
  });

  it('segnala un campo mancante in una lingua', () => {
    expect(diffLocales({ title: 'a', url: 'u' }, { title: 'b' }, tr)).toEqual([
      'url: campo presente in una sola lingua',
    ]);
  });

  it('segnala un valore non traducibile diverso', () => {
    const d = diffLocales({ title: 'a', url: 'u1' }, { title: 'b', url: 'u2' }, tr);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('url');
  });

  it('segnala array di lunghezza diversa', () => {
    expect(diffLocales({ items: ['a', 'b'] }, { items: ['a'] }, tr)[0]).toContain('items');
  });
});
