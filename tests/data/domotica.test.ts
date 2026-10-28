import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { domoticaModel } from '../../src/lib/domotica';
import { automationSchema } from '../../src/lib/schemas/automations';
import { humanSchema } from '../../src/lib/schemas/human';

const content = join(import.meta.dirname, '../../src/content');
const load = (locale: string) => {
  const dir = join(content, 'automations', locale);
  const entries = readdirSync(dir)
    .filter((file) => file.endsWith('.yml'))
    .map((file) => ({
      slug: file.replace(/\.yml$/, ''),
      data: automationSchema.parse(parse(readFileSync(join(dir, file), 'utf8'))),
    }));
  const rooms = humanSchema.parse(parse(readFileSync(join(content, `human/${locale}.yml`), 'utf8')))
    .domotica.rooms;
  return { rooms, entries };
};

describe('domoticaModel', () => {
  const { rooms, entries } = load('it');
  const model = domoticaModel(rooms, entries);

  it('mette ogni automazione nella sua stanza, una volta sola', () => {
    const placed = model.rooms.flatMap((r) => r.automations);
    expect(placed.toSorted()).toEqual(entries.map((e) => e.slug).toSorted());
    for (const r of model.rooms)
      for (const slug of r.automations)
        expect(entries.find((e) => e.slug === slug)?.data.room).toBe(r.id);
  });

  it('ordina per rank e poi per slug', () => {
    const ranks = model.automations.map(
      (a) => entries.find((e) => e.slug === a.slug)?.data.rank ?? 99,
    );
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
  });

  it('rifiuta una stanza che non esiste', () => {
    const [first] = entries;
    if (!first) throw new Error('nessuna automazione');
    const broken = { ...first, data: { ...first.data, room: 'cantina-segreta' } };
    expect(() => domoticaModel(rooms, [broken])).toThrow(/cantina-segreta/);
  });

  it('ha la stessa forma in IT e in EN', () => {
    const en = load('en');
    const shape = (m: typeof model) => m.rooms.map((r) => [r.id, r.kind, r.automations]);
    expect(shape(domoticaModel(en.rooms, en.entries))).toEqual(shape(model));
  });
});
