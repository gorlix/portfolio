import { describe, expect, it } from 'vitest';
import { domoticaModel } from '../../src/lib/domotica';
import { CHAIN, momentFocus } from '../../src/scripts/three/domotica/moments';

const model = domoticaModel(
  [
    { id: 'camera', name: 'Camera', kind: 'room' },
    { id: 'studio', name: 'Studio', kind: 'room' },
    { id: 'cucina', name: 'Cucina', kind: 'room' },
    { id: 'casa', name: 'Tutta la casa', kind: 'house' },
  ],
  [
    {
      slug: 'sveglie',
      data: { name: 'Sveglie', room: 'camera', trigger: 't', conditions: [], actions: ['a'] },
    },
    {
      slug: 'dnd',
      data: { name: 'DND', room: 'studio', trigger: 't', conditions: [], actions: ['a'] },
    },
    {
      slug: 'pc',
      data: { name: 'PC', room: 'studio', trigger: 't', conditions: [], actions: ['a'] },
    },
    {
      slug: 'backup',
      data: { name: 'Backup', room: 'casa', trigger: 't', conditions: [], actions: ['a'] },
    },
  ] as Parameters<typeof domoticaModel>[1],
);

describe('momentFocus', () => {
  it('prima schermata e nomi sconosciuti: vista d insieme', () => {
    expect(momentFocus('overview', model)).toEqual({ kind: 'overview' });
    expect(momentFocus(undefined, model)).toEqual({ kind: 'overview' });
    expect(momentFocus('non-esiste', model)).toEqual({ kind: 'overview' });
  });

  it('momenti a nome fisso', () => {
    for (const kind of ['climate', 'audio', 'weather', 'projects'])
      expect(momentFocus(kind, model)).toEqual({ kind });
  });

  it('una automazione: la sua stanza', () => {
    expect(momentFocus('sveglie', model)).toEqual({
      kind: 'automations',
      rooms: ['camera'],
      house: false,
    });
  });

  it('catena: stanze senza doppioni, nell ordine della pianta', () => {
    expect(momentFocus(['pc', 'dnd', 'sveglie'].join(CHAIN), model)).toEqual({
      kind: 'automations',
      rooms: ['camera', 'studio'],
      house: false,
    });
  });

  it('automazione di tutta la casa', () => {
    expect(momentFocus('backup', model)).toEqual({ kind: 'automations', rooms: [], house: true });
  });
});
