import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { homelabModel } from '../../src/lib/homelab';
import { infrastructureSchema } from '../../src/lib/schemas/infrastructure';

const load = (locale: string) =>
  infrastructureSchema.parse(
    parse(
      readFileSync(
        join(import.meta.dirname, `../../src/content/infrastructure/${locale}.yml`),
        'utf8',
      ),
    ),
  );

describe('homelabModel', () => {
  const infra = load('it');
  const model = homelabModel(infra);

  it('contiene ogni nodo e ogni servizio una sola volta, sotto il proprio sito', () => {
    const nodes = model.regions.flatMap((r) => r.nodes.map((n) => [r.id, n.id]));
    expect(nodes).toEqual(infra.nodes.map((n) => [n.region, n.id]));
    const services = model.regions.flatMap((r) =>
      r.nodes.flatMap((n) => n.services.map((s) => s.id)),
    );
    expect(services.toSorted()).toEqual(infra.services.map((s) => s.id).toSorted());
  });

  it('collega ogni ADR ai suoi nodi e ogni lavoro in corso al suo sito', () => {
    for (const a of infra.adrs) {
      for (const r of model.regions)
        for (const n of r.nodes) expect(n.adrs.includes(a.id)).toBe(a.nodes.includes(n.id));
    }
    expect(model.regions.flatMap((r) => r.wip).toSorted()).toEqual(
      infra.wip.map((w) => w.id).toSorted(),
    );
  });

  it('risolve failover e origine del backup sui nodi che li ospitano', () => {
    expect(model.failover).toEqual({
      primary: { service: 'adguard-primario', node: 'nodo-1' },
      backup: { service: 'adguard-backup', node: 'nodo-3' },
    });
    expect(model.backup.source).toMatchObject({ service: 'home-assistant', node: 'nodo-2' });
    expect(model.overlays).toEqual([['casa', 'produzione']]);
  });

  it('ha la stessa forma in IT e in EN', () => {
    const en = homelabModel(load('en'));
    const shape = (m: typeof model) =>
      m.regions.map((r) => r.nodes.map((n) => [n.id, n.services.map((s) => s.id), n.adrs]));
    expect(shape(en)).toEqual(shape(model));
  });
});

describe('dati sanitizzati', () => {
  // Nessun IPv4, dominio del sito o hostname con punto nei nomi (spec §11). I link agli ADR sono
  // l'unica eccezione: puntano al repository pubblico.
  const forbidden = /\b\d{1,3}(\.\d{1,3}){3}\b|alessandrogorla|\.(lan|local|home|internal)\b/i;
  it.each(['it', 'en'])('%s non contiene IP, domini o hostname', (locale) => {
    const raw = readFileSync(
      join(import.meta.dirname, `../../src/content/infrastructure/${locale}.yml`),
      'utf8',
    );
    const withoutUrls = raw.replace(/https:\/\/github\.com\/gorlix\/homelab\/\S+/g, '');
    expect(withoutUrls).not.toMatch(forbidden);
  });
});
