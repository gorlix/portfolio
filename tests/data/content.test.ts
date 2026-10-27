import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAlias, isNode, parse, parseDocument, visit } from 'yaml';
import { type CollectionName, collections } from '../../src/lib/data/collections';
import { diffLocales } from '../../src/lib/data/parity';
import { locales } from '../../src/lib/schemas/common';
import { infrastructureSchema } from '../../src/lib/schemas/infrastructure';
import { profileSchema } from '../../src/lib/schemas/profile';
import { projectSchema } from '../../src/lib/schemas/projects';
import { themeSchema } from '../../src/lib/schemas/theme';

const root = join(import.meta.dirname, '../../src/content');
const names = Object.keys(collections) as CollectionName[];

/** Tutti i file YAML di una collezione: `{ locale, slug, path }`. */
function files(name: CollectionName) {
  const def = collections[name];
  const dir = join(root, name);
  if (def.kind === 'singleton') {
    return locales
      .filter((l) => existsSync(join(dir, `${l}.yml`)))
      .map((locale) => ({ locale, slug: 'singleton', path: join(dir, `${locale}.yml`) }));
  }
  return locales.flatMap((locale) => {
    const sub = join(dir, locale);
    if (!existsSync(sub)) return [];
    return readdirSync(sub)
      .filter((f) => f.endsWith('.yml'))
      .map((f) => ({ locale, slug: f.slice(0, -4), path: join(sub, f) }));
  });
}

describe.each(names)('collezione %s', (name) => {
  const def = collections[name];
  const entries = files(name);

  it('ha il layout multiple_folders per ogni lingua', () => {
    const dir = join(root, name);
    for (const locale of locales) {
      expect(
        existsSync(def.kind === 'singleton' ? join(dir, `${locale}.yml`) : join(dir, locale)),
        `${name}/${locale}`,
      ).toBe(true);
    }
  });

  it('usa slug in kebab-case e YAML standard (niente ancore, alias, tag)', () => {
    for (const e of entries) {
      expect(e.slug, e.path).toMatch(/^(singleton|[a-z0-9]+(-[a-z0-9]+)*)$/);
      const doc = parseDocument(readFileSync(e.path, 'utf8'));
      expect(doc.errors, e.path).toEqual([]);
      visit(doc, (_key, node) => {
        if (isAlias(node)) expect.fail(`${e.path}: alias YAML`);
        if (isNode(node) && (node.anchor || node.tag)) expect.fail(`${e.path}: ancora o tag YAML`);
      });
    }
  });

  it('valida ogni voce con lo schema Zod', () => {
    for (const e of entries) {
      const result = def.schema.safeParse(parse(readFileSync(e.path, 'utf8')));
      expect(result.error?.issues, e.path).toBeUndefined();
    }
  });

  it('ha la corrispondente EN per ogni voce IT (stessi slug) e parita di struttura', () => {
    const slugs = (l: string) =>
      entries
        .filter((e) => e.locale === l)
        .map((e) => e.slug)
        .sort();
    expect(slugs('en')).toEqual(slugs('it'));
    for (const itEntry of entries.filter((e) => e.locale === 'it')) {
      const enEntry = entries.find((e) => e.locale === 'en' && e.slug === itEntry.slug);
      if (!enEntry) continue;
      const diff = diffLocales(
        parse(readFileSync(itEntry.path, 'utf8')),
        parse(readFileSync(enEntry.path, 'utf8')),
        def.translatable,
      );
      expect(diff, itEntry.slug).toEqual([]);
    }
  });
});

describe('schemi: casi negativi', () => {
  const base = parse(readFileSync(join(root, 'profile/it.yml'), 'utf8'));

  it('rifiuta un profilo senza email', () => {
    const { email: _email, ...rest } = base;
    expect(profileSchema.safeParse(rest).success).toBe(false);
  });

  it('rifiuta URL non https e campi sconosciuti', () => {
    expect(
      profileSchema.safeParse({ ...base, links: { ...base.links, github: 'http://x.test' } })
        .success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('accetta un dato mancante solo se dichiarato todo', () => {
    expect(profileSchema.safeParse({ ...base, role: { todo: 'ruolo' } }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, role: '' }).success).toBe(false);
  });

  it('rifiuta un metodo di progetto non valido', () => {
    const project = parse(readFileSync(join(root, 'projects/it/my-adept.yml'), 'utf8'));
    expect(projectSchema.safeParse({ ...project, method: 'magia' }).success).toBe(false);
  });

  it("rifiuta riferimenti rotti nell'infrastruttura simulata", () => {
    const infra = parse(readFileSync(join(root, 'infrastructure/it.yml'), 'utf8'));
    const broken = { ...infra, services: [{ ...infra.services[0], node: 'nodo-inesistente' }] };
    expect(infrastructureSchema.safeParse(broken).success).toBe(false);
    const adr = { ...infra.adrs[0], nodes: ['nodo-inesistente'] };
    expect(infrastructureSchema.safeParse({ ...infra, adrs: [adr] }).success).toBe(false);
  });

  it('rifiuta un backup che non rispetta il 3-2-1', () => {
    const infra = parse(readFileSync(join(root, 'infrastructure/it.yml'), 'utf8'));
    const targets = infra.backup.targets;
    const withBackup = (t: unknown[]) => ({ ...infra, backup: { ...infra.backup, targets: t } });
    expect(infrastructureSchema.safeParse(infra).success).toBe(true);
    expect(infrastructureSchema.safeParse(withBackup(targets.slice(0, 2))).success).toBe(false);
    const onsite = targets.map((t: object) => ({ ...t, offsite: false }));
    expect(infrastructureSchema.safeParse(withBackup(onsite)).success).toBe(false);
    const sameMedium = targets.map((t: object) => ({ ...t, medium: 'cloud' }));
    expect(infrastructureSchema.safeParse(withBackup(sameMedium)).success).toBe(false);
  });

  it('rifiuta un tema che non elenca tutte le sezioni', () => {
    const theme = parse(readFileSync(join(root, 'theme/it.yml'), 'utf8'));
    expect(themeSchema.safeParse({ sections: theme.sections.slice(1) }).success).toBe(false);
  });
});
