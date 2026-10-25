import { getCollection } from 'astro:content';
import type { z } from 'astro/zod';
import type { Locale } from '../schemas/common';
import { type CollectionName, collections } from './collections';
import { diffLocales } from './parity';

/**
 * Unico punto di accesso ai contenuti. Pagine e generatori importano da qui, mai da
 * `astro:content`: cosi il loader (oggi YAML su disco) si puo sostituire senza toccarli.
 * Tutto avviene a build time; nessun fetch a runtime.
 */
type Data<N extends CollectionName> = z.infer<(typeof collections)[N]['schema']>;
export interface Entry<N extends CollectionName> {
  slug: string;
  data: Data<N>;
}

/** Carica tutte le voci e verifica la parita IT/EN: se manca una traduzione la build fallisce. */
async function loadAll<N extends CollectionName>(name: N) {
  const def = collections[name];
  const raw = await getCollection(name as never);
  const bySlug = new Map<string, Partial<Record<Locale, unknown>>>();

  for (const entry of raw as { id: string; data: unknown }[]) {
    const [locale, slug = 'singleton'] =
      def.kind === 'singleton' ? [entry.id, 'singleton'] : entry.id.split('/');
    const group = bySlug.get(slug) ?? {};
    group[locale as Locale] = entry.data;
    bySlug.set(slug, group);
  }

  const problems: string[] = [];
  for (const [slug, pair] of bySlug) {
    if (!pair.it || !pair.en) {
      problems.push(`${name}/${slug}: manca la versione ${pair.it ? 'EN' : 'IT'}`);
      continue;
    }
    for (const d of diffLocales(pair.it, pair.en, def.translatable))
      problems.push(`${name}/${slug}: ${d}`);
  }
  if (problems.length) throw new Error(`Parita IT/EN violata:\n${problems.join('\n')}`);
  return bySlug;
}

export async function getEntries<N extends CollectionName>(
  name: N,
  locale: Locale,
): Promise<Entry<N>[]> {
  const bySlug = await loadAll(name);
  return [...bySlug]
    .map(([slug, pair]) => ({ slug, data: pair[locale] as Data<N> }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getSingleton<N extends CollectionName>(
  name: N,
  locale: Locale,
): Promise<Data<N>> {
  const [entry] = await getEntries(name, locale);
  if (!entry) throw new Error(`Contenuto mancante: ${name}/${locale}`);
  return entry.data;
}
