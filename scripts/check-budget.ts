// Verifica i budget di peso sul sito compilato: `node scripts/check-budget.ts [dist]` (spec §3.5).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkBudgets, linkedAssets, type Measured, staticImports } from './budget.ts';

const dist = process.argv[2] ?? 'dist';
const gz = (file: string) => gzipSync(readFileSync(file), { level: 9 }).length;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const assets = join(dist, '_astro');
const chunks = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((file) => ({ file, gzip: gz(join(assets, file)) }));

/** Uno script piu i moduli che importa staticamente, ciascuno contato una volta. */
const scriptClosure = (entry: string, seen: Set<string>): number => {
  if (seen.has(entry)) return 0;
  seen.add(entry);
  const file = join(dist, entry);
  const own = gz(file);
  const nested = staticImports(readFileSync(file, 'utf8')).map((spec) =>
    scriptClosure(posix.join(posix.dirname(entry), spec), seen),
  );
  return own + nested.reduce((a, b) => a + b, 0);
};

const pages = walk(dist)
  .filter((f) => f.endsWith('index.html'))
  .map((file) => {
    const url = `/${relative(dist, file).replace(/index\.html$/, '')}`;
    const html = readFileSync(file, 'utf8');
    const { css, scripts } = linkedAssets(html);
    const seen = new Set<string>();
    const scriptGzip = scripts.reduce((sum, s) => sum + scriptClosure(s, seen), 0);
    const cssGzip = [...new Set(css)].reduce((sum, c) => sum + gz(join(dist, c)), 0);
    return { url, totalGzip: gz(file) + cssGzip + scriptGzip, scriptGzip };
  });

const measured: Measured = { chunks, pages };
for (const p of pages)
  console.log(
    `${p.url.padEnd(16)} ${(p.totalGzip / 1024).toFixed(1).padStart(6)} KB (script ${(p.scriptGzip / 1024).toFixed(1)} KB)`,
  );
for (const c of chunks)
  console.log(`${c.file.padEnd(60)} ${(c.gzip / 1024).toFixed(1).padStart(6)} KB`);

const errors = checkBudgets(measured);
if (errors.length) {
  console.error(`\nBudget di peso superati:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('budget ok');
