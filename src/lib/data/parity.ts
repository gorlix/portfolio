const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const matches = (path: string, patterns: readonly string[]) => patterns.includes(path);

/**
 * Confronta la voce IT con la EN. Restituisce l'elenco delle differenze (vuoto = parita):
 * stessa struttura; campi non traducibili identici.
 * `path` usa `*` al posto degli indici di array, come `translatable`.
 */
export function diffLocales(
  it: unknown,
  en: unknown,
  translatable: readonly string[],
  path = '',
): string[] {
  const label = path || '(radice)';

  if (Array.isArray(it) || Array.isArray(en)) {
    if (!Array.isArray(it) || !Array.isArray(en)) return [`${label}: array in una sola lingua`];
    if (it.length !== en.length)
      return [`${label}: ${it.length} elementi in IT, ${en.length} in EN`];
    return it.flatMap((item, i) =>
      diffLocales(item, en[i], translatable, `${path}.*`.replace(/^\./, '')),
    );
  }

  if (isObject(it) || isObject(en)) {
    if (!isObject(it) || !isObject(en)) return [`${label}: oggetto in una sola lingua`];
    const keys = new Set([...Object.keys(it), ...Object.keys(en)]);
    return [...keys].flatMap((key) => {
      const child = path ? `${path}.${key}` : key;
      if (!(key in it) || !(key in en)) return [`${child}: campo presente in una sola lingua`];
      return diffLocales(it[key], en[key], translatable, child);
    });
  }

  if (matches(path, translatable)) {
    return typeof it === typeof en ? [] : [`${label}: tipo diverso tra IT e EN`];
  }
  return Object.is(it, en)
    ? []
    : [`${label}: valore non traducibile diverso (${String(it)} / ${String(en)})`];
}
