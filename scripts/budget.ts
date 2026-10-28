// Budget di peso del sito (spec §3.5), in byte gzip. Logica pura: la lettura di dist sta in check-budget.ts.

/** Peso a regime di un chunk JS di `_astro/`, riconosciuto dal prefisso del nome. */
export interface ChunkBudget {
  name: string;
  pattern: RegExp;
  maxGzip: number;
}

/** Primo caricamento di una pagina: HTML + CSS + script collegati direttamente (non i chunk pigri). */
export interface PageBudget {
  name: string;
  pattern: RegExp;
  maxTotalGzip: number;
  maxScriptGzip: number;
}

const KB = 1024;

export const chunkBudgets: ChunkBudget[] = [
  // three intero (tree-shaken), caricato solo quando una scena si avvicina.
  { name: 'three', pattern: /^three\./, maxGzip: 140 * KB },
  // Ogni scena di /human, con i suoi moduli (dati, controlli, metriche).
  { name: 'scena', pattern: /^(homelab|domotica|placeholder)\./, maxGzip: 16 * KB },
  // Codice condiviso tra le scene (orbit, pannello), se il bundler lo separa.
  { name: 'condiviso scene', pattern: /^(orbit|panel|tokens)\./, maxGzip: 4 * KB },
  { name: 'bootstrap 3D', pattern: /^Scene\.astro_/, maxGzip: 4 * KB },
  { name: 'barra del tempo', pattern: /^Timeline\.astro_/, maxGzip: 2 * KB },
  { name: 'terminale', pattern: /^Terminal\.astro_/, maxGzip: 2 * KB },
];

export const pageBudgets: PageBudget[] = [
  { name: 'ingresso', pattern: /^\/(en\/)?$/, maxTotalGzip: 15 * KB, maxScriptGzip: 2 * KB },
  {
    name: 'percorsi leggeri',
    pattern: /^\/(en\/)?(recruiter|agent)\/$/,
    maxTotalGzip: 15 * KB,
    maxScriptGzip: 0,
  },
  // Il 3D non conta: arriva dopo, solo vicino alle scene.
  { name: 'umano', pattern: /^\/(en\/)?human\/$/, maxTotalGzip: 32 * KB, maxScriptGzip: 6 * KB },
];

export interface Measured {
  chunks: { file: string; gzip: number }[];
  pages: { url: string; totalGzip: number; scriptGzip: number }[];
}

const kb = (bytes: number) => `${(bytes / KB).toFixed(1)} KB`;

/** Elenco delle violazioni (vuoto = budget rispettati). Un chunk senza budget e una violazione. */
export function checkBudgets(
  measured: Measured,
  chunks: ChunkBudget[] = chunkBudgets,
  pages: PageBudget[] = pageBudgets,
): string[] {
  const errors: string[] = [];
  for (const { file, gzip } of measured.chunks) {
    const budget = chunks.find((b) => b.pattern.test(file));
    if (!budget) errors.push(`${file}: chunk JS senza budget (aggiungerlo in scripts/budget.ts)`);
    else if (gzip > budget.maxGzip)
      errors.push(`${file} (${budget.name}): ${kb(gzip)} > ${kb(budget.maxGzip)}`);
  }
  for (const page of measured.pages) {
    const budget = pages.find((b) => b.pattern.test(page.url));
    if (!budget) {
      errors.push(`${page.url}: pagina senza budget`);
      continue;
    }
    if (page.totalGzip > budget.maxTotalGzip)
      errors.push(
        `${page.url} (${budget.name}): ${kb(page.totalGzip)} > ${kb(budget.maxTotalGzip)}`,
      );
    if (page.scriptGzip > budget.maxScriptGzip)
      errors.push(
        `${page.url} (${budget.name}): script ${kb(page.scriptGzip)} > ${kb(budget.maxScriptGzip)}`,
      );
  }
  return errors;
}

/** Riferimenti statici a CSS e moduli in una pagina HTML (gli `import()` pigri restano fuori). */
export function linkedAssets(html: string): { css: string[]; scripts: string[] } {
  const css = [...html.matchAll(/<link[^>]+href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1] ?? '');
  const scripts = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)].map(
    (m) => m[1] ?? '',
  );
  return { css, scripts };
}

/** Import statici di un modulo ES minificato (`import"./x.js"`, `from"./x.js"`). */
export function staticImports(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["'](\.\/[^"']+\.js)["']/g)].map(
    (m) => m[1] ?? '',
  );
}
