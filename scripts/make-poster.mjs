// Genera i poster statici delle sezioni immersive di /human (fallback senza WebGL, risparmio dati o
// JS spento) e delle pagine di approfondimento dei lavori. Uso: `pnpm build && pnpm preview --port 4321`
// in un terminale, poi `node scripts/make-poster.mjs [origine]`. Cattura ogni scena sulla prima inquadratura, senza vetro ne
// intestazione; con reduced-motion la scena disegna un solo fotogramma fermo.
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://localhost:4321';
/** Facoltativo: rigenera solo i poster con questi prefissi (es. `lavori-poster,trimind-poster`). */
const only = process.argv[3]?.split(',');
const out = 'src/assets/human';
const sizes = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'mobile', width: 390, height: 844, scale: 1 },
];
const targets = [
  { path: '/human/', section: 'home', scene: 'scrivania', prefix: 'poster' },
  { path: '/human/', section: 'lavori', scene: 'lavori', prefix: 'lavori-poster' },
  { path: '/human/', section: 'domotica', scene: 'domotica', prefix: 'domotica-poster' },
  { path: '/human/', section: 'sport', scene: 'sport', prefix: 'sport-poster' },
  { path: '/human/', section: 'interessi', scene: 'interessi', prefix: 'interessi-poster' },
  { path: '/human/', section: 'contatti', scene: 'contatti', prefix: 'contatti-poster' },
  { path: '/human/', section: 'beneficenza', scene: 'beneficenza', prefix: 'beneficenza-poster' },
  {
    path: '/human/',
    section: 'certificazioni',
    scene: 'certificazioni',
    prefix: 'certificazioni-poster',
  },
  {
    path: '/human/lavori/trimind/',
    section: 'trimind',
    scene: 'trimind',
    prefix: 'trimind-poster',
  },
  {
    path: '/human/lavori/open-source/',
    section: 'open-source',
    scene: 'opensource',
    prefix: 'opensource-poster',
  },
];

const browser = await chromium.launch();
for (const { path, section, scene, prefix } of targets) {
  if (only && !only.includes(prefix)) continue;
  for (const { name, width, height, scale } of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`${origin}${path}#${section}`);
    await page.waitForSelector(`#${section} [data-scene="${scene}"][data-scene-state="static"]`, {
      timeout: 20_000,
    });
    await page.addStyleTag({
      content: `header, nav[data-timeline], #${section} > :not(.stage) { visibility: hidden !important; } #${section} .stage { opacity: 1 !important; }`,
    });
    await page.locator(`#${section} .stage`).screenshot({ path: `${out}/${prefix}-${name}.png` });
    await context.close();
  }
}
await browser.close();
