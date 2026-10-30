// Valida i file per macchine e scansiona tutti i file di testo pubblicati: `node scripts/validate-machine.ts [dist]`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import {
  scanText,
  validateAgentMd,
  validateJsonLd,
  validateLlmsTxt,
  validateProfileJson,
  validateRobotsTxt,
  validateSitemapXml,
} from '../src/lib/machine/validate.ts';

const dist = process.argv[2] ?? 'dist';
const textExt = new Set(['.html', '.txt', '.md', '.json', '.xml', '.css', '.js', '.svg', '.map']);
const validators: Record<string, (text: string) => string[]> = {
  'llms.txt': validateLlmsTxt,
  'agent.md': validateAgentMd,
  'profile.json': validateProfileJson,
  'robots.txt': validateRobotsTxt,
  'sitemap.xml': validateSitemapXml,
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
// /admin = pannello CMS di terze parti (Sveltia), non un contenuto del sito: fuori dalle scansioni.
const site = (files: string[]) => files.filter((f) => relative(dist, f).split('/')[0] !== 'admin');

const errors: string[] = [];
for (const [file, validate] of Object.entries(validators)) {
  let text: string;
  try {
    text = readFileSync(join(dist, file), 'utf8');
  } catch {
    errors.push(`${file}: file mancante nella build`);
    continue;
  }
  for (const p of validate(text)) errors.push(`${file}: ${p}`);
}
// Ogni pagina HTML porta il suo JSON-LD valido (la 404 non e una pagina del sito).
for (const path of site(walk(dist)).filter((f) => f.endsWith('.html') && !f.endsWith('/404.html')))
  for (const p of validateJsonLd(readFileSync(path, 'utf8')))
    errors.push(`${relative(dist, path)}: JSON-LD: ${p}`);
for (const path of site(walk(dist)).filter((f) => textExt.has(extname(f)))) {
  for (const f of scanText(readFileSync(path, 'utf8')))
    errors.push(`${relative(dist, path)}: ${f.rule} "${f.match}"`);
}

if (errors.length) {
  console.error(`File per macchine NON validi:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('file per macchine ok');
