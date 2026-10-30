// Genera l'immagine Open Graph statica (1200x630) in public/og.png: prompt da terminale, nome e ruolo.
// Uso: `pnpm make:og`. Colori da @catppuccin/palette (Mocha), testo da src/content/profile/it.yml.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { flavors } from '@catppuccin/palette';
import { chromium } from '@playwright/test';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const c = Object.fromEntries(
  Object.entries(flavors.mocha.colors).map(([name, { hex }]) => [name, hex]),
);
const { name, role } = parse(readFileSync('src/content/profile/it.yml', 'utf8'));
const fontFile = require.resolve(
  '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
);
const font = readFileSync(fontFile).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: JB; font-weight: 100 800; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: ${c.base}; color: ${c.text}; font-family: JB, monospace; display: flex; flex-direction: column; }
.bar { height: 56px; background: ${c.mantle}; border-bottom: 2px solid ${c.surface0}; display: flex; align-items: center; gap: 12px; padding: 0 32px; }
.dot { width: 16px; height: 16px; border-radius: 50%; }
.main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 80px; gap: 28px; }
.name { font-size: 80px; font-weight: 800; white-space: nowrap; line-height: 1.1; }
.prompt { color: ${c.green}; }
.role { font-size: 44px; color: ${c.blue}; padding-left: 70px; }
.cursor { display: inline-block; width: 26px; height: 52px; background: ${c.rosewater}; vertical-align: -8px; margin-left: 14px; }
.rule { height: 8px; background: ${c.mauve}; }
</style>
<div class="bar"><span class="dot" style="background:${c.red}"></span><span class="dot" style="background:${c.yellow}"></span><span class="dot" style="background:${c.green}"></span></div>
<div class="main"><div class="name"><span class="prompt">❯</span> ${name}</div><div class="role">${role}<span class="cursor"></span></div></div>
<div class="rule"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
