// Configurazione di Sveltia CMS generata dagli schemi Zod (una sola fonte: `src/lib/data/collections.ts`).
// Rigenerare con `pnpm cms:config`; `tests/cms` verifica che `public/admin/config.yml` non diverga.
import { z } from 'astro/zod';
import { stringify } from 'yaml';
import { collections } from '../data/collections';
import { locales } from '../schemas/common';

type Json = Record<string, unknown>;
type CmsField = Record<string, unknown> & { name: string; widget: string };

/** Etichette dell'interfaccia del CMS (non sono contenuti del sito). */
const dateHint = 'Anno (2024), anno-mese (2024-05) o data completa (2024-05-17).';
/** Nomi di campo con testo lungo: widget a piu righe. Scelta per nome, mai dai contenuti. */
const longText = /^(tagline|text|description|lead|summary|note|.*(Description|Note|Lead))$/;
/** Campo usato come titolo e nome file delle voci, in ordine di preferenza. */
const identifierCandidates = ['name', 'title', 'company', 'institution'];

const isNullBranch = (node: Json): boolean => node.type === 'null';

/** Percorso con `*` per gli elementi di array, come in `translatable`. */
const isTranslatable = (path: string[], translatable: string[]): boolean =>
  translatable.some((t) => t === path.join('.') || t.startsWith(`${path.join('.')}.`));

const i18nFlag = (path: string[], translatable: string[]) =>
  isTranslatable(path, translatable) ? true : 'duplicate';

interface Ctx {
  translatable: string[];
}

function mapField(name: string, node: Json, required: boolean, path: string[], ctx: Ctx): CmsField {
  let schema = node;
  let optional = !required;

  if (Array.isArray(schema.anyOf)) {
    const flat = (nodes: Json[]): Json[] =>
      nodes.flatMap((b) => (Array.isArray(b.anyOf) ? flat(b.anyOf as Json[]) : [b]));
    const branches = flat(schema.anyOf as Json[]).filter((b) => {
      if (isNullBranch(b)) optional = true;
      else return true;
      return false;
    });
    if (branches.length !== 1) throw new Error(`${path.join('.')}: unione non supportata`);
    schema = {
      ...(branches[0] as Json),
      ...(schema.default !== undefined ? { default: schema.default } : {}),
    };
  }
  if (Array.isArray(schema.type)) {
    const types = (schema.type as string[]).filter((t) => t !== 'null');
    if (types.length !== schema.type.length) optional = true;
    schema = { ...schema, type: types[0] };
  }

  const base: Json = { name, i18n: i18nFlag(path, ctx.translatable) };
  if (optional) base.required = false;
  const hints: string[] = [];

  const finish = (field: Json): CmsField => {
    if (schema.default !== undefined) field.default = schema.default;
    if (hints.length) field.hint = hints.join(' ');
    return { ...base, ...field } as CmsField;
  };

  if ('const' in schema) {
    return finish({ widget: 'boolean', default: schema.const, readonly: true });
  }
  if (Array.isArray(schema.enum)) {
    return finish({ widget: 'select', options: schema.enum });
  }
  switch (schema.type) {
    case 'string': {
      const field: Json = { widget: longText.test(name) ? 'text' : 'string' };
      if (schema.format === 'email') field.type = 'email';
      else if (schema.format === 'uri') field.type = 'url';
      if (typeof schema.pattern === 'string' && !schema.format) {
        field.pattern = [schema.pattern, 'Formato non valido'];
        if (/\\d\{4\}/.test(schema.pattern)) hints.push(dateHint);
      }
      return finish(field);
    }
    case 'integer':
    case 'number': {
      const field: Json = { widget: 'number' };
      if (schema.type === 'integer') field.value_type = 'int';
      const min =
        typeof schema.minimum === 'number'
          ? schema.minimum
          : typeof schema.exclusiveMinimum === 'number'
            ? schema.exclusiveMinimum + 1
            : undefined;
      if (min !== undefined) field.min = min;
      if (typeof schema.maximum === 'number') field.max = schema.maximum;
      return finish(field);
    }
    case 'boolean':
      return finish({ widget: 'boolean' });
    case 'array': {
      const field: Json = { widget: 'list' };
      if (typeof schema.minItems === 'number') field.min = schema.minItems;
      if (typeof schema.maxItems === 'number') field.max = schema.maxItems;
      const items = schema.items as Json;
      const itemPath = [...path, '*'];
      if (items.type === 'object' && items.properties) {
        field.fields = mapObjectFields(items, itemPath, ctx);
      } else {
        field.field = mapField('item', items, true, itemPath, ctx);
      }
      return finish(field);
    }
    case 'object':
      return finish({ widget: 'object', fields: mapObjectFields(schema, path, ctx) });
    default:
      throw new Error(
        `${path.join('.')}: tipo non supportato (${JSON.stringify(schema).slice(0, 80)})`,
      );
  }
}

function mapObjectFields(node: Json, path: string[], ctx: Ctx): CmsField[] {
  const props = (node.properties ?? {}) as Record<string, Json>;
  const required = new Set((node.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([key, child]) =>
    mapField(key, child, required.has(key), [...path, key], ctx),
  );
}

export function fieldsFor(name: keyof typeof collections): CmsField[] {
  const def = collections[name];
  const json = z.toJSONSchema(def.schema, { io: 'input', unrepresentable: 'any' }) as Json;
  return mapObjectFields(json, [], { translatable: def.translatable });
}

const title = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

export function buildCmsConfig(): Json {
  const names = Object.keys(collections) as (keyof typeof collections)[];
  const singletons = names.filter((n) => collections[n].kind === 'singleton');
  const folders = names.filter((n) => collections[n].kind === 'folder');

  return {
    backend: {
      name: 'github',
      repo: 'gorlix/portfolio',
      branch: 'main',
      // Login GitHub tramite il Worker OAuth (docs/CMS.md, fase 2). Senza `base_url` resta la sola modalita locale.
      base_url: 'https://sveltia-cms-auth.ale-gorla2002.workers.dev',
      // Scopo minimo per un repository pubblico: niente accesso ai repository privati.
      auth_scope: 'public_repo',
    },
    // Ogni salvataggio crea un branch e una PR; "Publish" nel CMS la unisce. Mai scrittura diretta su `main`.
    publish_mode: 'editorial_workflow',
    // Upload media disattivato in fase 1: foto e CV vivono in `src/assets` e `public/cv`, fuori dal CMS.
    media_folder: 'public/cv',
    public_folder: '/cv',
    site_url: 'https://alessandrogorla.it',
    i18n: { structure: 'multiple_folders', locales: [...locales], default_locale: locales[0] },
    output: { omit_empty_optional_fields: true, yaml: { quote: 'double', indent_size: 2 } },
    collections: [
      {
        name: 'pagine',
        label: 'Pagine e testi',
        i18n: true,
        files: singletons.map((n) => ({
          name: n,
          label: title(n),
          file: `src/content/${n}/{{locale}}.yml`,
          i18n: true,
          fields: fieldsFor(n),
        })),
      },
      ...folders.map((n) => {
        const fields = fieldsFor(n);
        const identifier = identifierCandidates.find((c) => fields.some((f) => f.name === c));
        return {
          name: n,
          label: title(n),
          folder: `src/content/${n}`,
          extension: 'yml',
          format: 'yaml',
          create: true,
          i18n: true,
          ...(identifier ? { identifier_field: identifier } : {}),
          fields,
        };
      }),
    ],
  };
}

const header =
  '# GENERATO da `pnpm cms:config` dagli schemi Zod (src/lib/schemas): non modificare a mano.\n';

/** Contenuto esatto di `public/admin/config.yml`. */
export const renderCmsConfig = (): string => header + stringify(buildCmsConfig(), { lineWidth: 0 });
