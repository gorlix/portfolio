import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildCmsConfig, renderCmsConfig } from '../../src/lib/cms/config';
import { collections } from '../../src/lib/data/collections';

const root = join(import.meta.dirname, '../..');
const committed = readFileSync(join(root, 'public/admin/config.yml'), 'utf8');
const config = buildCmsConfig() as {
  i18n: { structure: string; locales: string[]; default_locale: string };
  collections: {
    name: string;
    folder?: string;
    files?: { name: string; file: string; fields: Field[] }[];
    fields?: Field[];
  }[];
};
interface Field {
  name: string;
  i18n?: boolean | string;
  widget: string;
  fields?: Field[];
  field?: Field;
}

/** Percorsi (con `*` per gli elementi di lista) dei campi foglia con la loro i18n. */
const leaves = (fields: Field[], prefix: string[] = []): [string, boolean | string | undefined][] =>
  fields.flatMap((f) => {
    const path = [...prefix, f.name];
    if (f.fields) return leaves(f.fields, f.widget === 'list' ? [...path, '*'] : path);
    if (f.field) return [[[...path, '*'].join('.'), f.field.i18n]];
    return [[path.join('.'), f.i18n]];
  });

const fieldsOf = (name: string): Field[] =>
  config.collections.flatMap((c) => c.files ?? []).find((f) => f.name === name)?.fields ??
  config.collections.find((c) => c.name === name)?.fields ??
  [];

describe('config del CMS', () => {
  it('public/admin/config.yml e aggiornato (esegui `pnpm cms:config`)', () => {
    expect(committed).toBe(renderCmsConfig());
  });

  it('rispetta lo schema di configurazione di Sveltia', () => {
    const schema = JSON.parse(
      readFileSync(join(root, 'node_modules/@sveltia/cms/schema/sveltia-cms.json'), 'utf8'),
    );
    const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(
      schema,
    );
    const ok = validate(parse(committed));
    expect(validate.errors?.slice(0, 5) ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('usa il layout i18n dei dati: una cartella per lingua', () => {
    expect(config.i18n).toMatchObject({ structure: 'multiple_folders', default_locale: 'it' });
    expect(config.i18n.locales).toEqual(['it', 'en']);
  });

  it('ogni cartella di src/content e nel config, e viceversa', () => {
    const dirs = readdirSync(join(root, 'src/content')).sort();
    const inConfig = config.collections
      .flatMap((c) => (c.files ? c.files.map((f) => f.name) : [c.name]))
      .sort();
    expect(inConfig).toEqual(dirs);
    expect(inConfig).toEqual(Object.keys(collections).sort());
  });

  it.each(Object.entries(collections))(
    '%s: percorsi del config coincidono con i file',
    (name, def) => {
      for (const locale of ['it', 'en']) {
        if (def.kind === 'singleton') {
          const file = config.collections
            .flatMap((c) => c.files ?? [])
            .find((f) => f.name === name)?.file;
          expect(file).toBe(`src/content/${name}/{{locale}}.yml`);
          expect(readdirSync(join(root, 'src/content', name))).toContain(`${locale}.yml`);
        } else {
          const folder = config.collections.find((c) => c.name === name)?.folder;
          expect(folder).toBe(`src/content/${name}`);
          expect(readdirSync(join(root, folder as string, locale)).length).toBeGreaterThan(0);
        }
      }
    },
  );

  it.each(Object.entries(collections))(
    '%s: i18n dei campi segue la lista dei traducibili',
    (name, def) => {
      const all = leaves(fieldsOf(name));
      const translated = all.filter(([, i18n]) => i18n === true).map(([p]) => p);
      for (const [path, i18n] of all) expect([true, 'duplicate'], path).toContain(i18n);
      // Ogni percorso traducibile e un campo del CMS con i18n attiva...
      for (const t of def.translatable) {
        const hit = all.some(([p, i18n]) => i18n === true && (p === t || p.startsWith(`${t}.`)));
        expect(hit, `${name}.${t} non e traducibile nel CMS`).toBe(true);
      }
      // ...e nessun campo e traducibile senza stare nella lista.
      for (const p of translated) {
        const listed = def.translatable.some((t) => p === t || p.startsWith(`${t}.`));
        expect(listed, `${name}.${p} traducibile nel CMS ma non nello schema`).toBe(true);
      }
    },
  );
});
