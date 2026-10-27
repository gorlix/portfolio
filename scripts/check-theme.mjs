// Verifica il tema: palette allineata a @catppuccin/palette, contrasti AA, nessun colore fuori da theme.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { flavors } from '@catppuccin/palette';
import { contrast } from './contrast.mjs';

const THEME = 'src/styles/theme.css';
const css = readFileSync(THEME, 'utf8');
const errors = [];

// Blocchi: il primo `:root {` e Mocha; il blocco `:root:not([data-theme="mocha"])` e Latte.
const blocks = [...css.matchAll(/(:root(?::not\(\[data-theme="mocha"\]\))?)\s*\{([^}]*)\}/g)];
const declsOf = (selector) =>
  Object.fromEntries(
    blocks
      .filter((b) => b[1] === selector)
      .flatMap((b) =>
        [...b[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
      ),
  );

const mocha = declsOf(':root');
const latte = { ...mocha, ...declsOf(':root:not([data-theme="mocha"])') };

const resolve = (vars, name, depth = 0) => {
  const value = vars[name];
  if (value === undefined || depth > 8) throw new Error(`token non risolvibile: ${name}`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], depth + 1) : value;
};

// 1. Palette identica al pacchetto.
for (const [flavor, vars] of [
  ['mocha', mocha],
  ['latte', latte],
]) {
  for (const [key, color] of Object.entries(flavors[flavor].colors)) {
    const token = `--ctp-${key}`;
    if (vars[token] === undefined) continue;
    if (vars[token].toLowerCase() !== color.hex) {
      errors.push(`${flavor} ${token}: ${vars[token]} != palette ${color.hex}`);
    }
  }
}

// 2. Contrasti. [primo piano, sfondo, minimo]
const sections = [
  'home',
  'lavori',
  'homelab',
  'domotica',
  'certificazioni',
  'sport',
  'interessi',
  'beneficenza',
  'contatti',
];
const pairs = [
  ...['--bg', '--bg-alt', '--surface'].flatMap((bg) => [
    ['--text', bg, 4.5],
    ['--text-muted', bg, 4.5],
    ['--link', bg, 4.5],
    ...sections.map((s) => [`--sec-${s}-ink`, bg, 4.5]),
  ]),
  ['--focus', '--bg', 3],
  ['--danger', '--bg', 4.5],
];
for (const [flavor, vars] of [
  ['mocha', mocha],
  ['latte', latte],
]) {
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
    if (ratio < min) errors.push(`${flavor} ${fg} su ${bg}: ${ratio.toFixed(2)} < ${min}`);
  }
}

// 3. Nessun colore letterale fuori dal file di tema.
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/;
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
for (const file of walk('src').filter((f) => /\.(css|astro|ts|js|svg)$/.test(f))) {
  if (file === THEME) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (colorLiteral.test(line)) errors.push(`${file}:${i + 1}: colore hardcoded`);
    });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('theme ok');
