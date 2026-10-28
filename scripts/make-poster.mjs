// Genera i poster statici delle sezioni immersive di /human (fallback senza WebGL, risparmio dati o
// JS spento). Uso: `pnpm build && pnpm preview --port 4321` in un terminale, poi
// `node scripts/make-poster.mjs`. Cattura ogni scena sulla prima inquadratura, senza vetro ne
// intestazione; con reduced-motion la scena disegna un solo fotogramma fermo.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4321/human/';
const out = 'src/assets/human';
const sizes = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'mobile', width: 390, height: 844, scale: 1 },
];
const targets = [
  { section: 'home', scene: 'scrivania', prefix: 'poster' },
  { section: 'domotica', scene: 'domotica', prefix: 'domotica-poster' },
];

const browser = await chromium.launch();
for (const { section, scene, prefix } of targets) {
  for (const { name, width, height, scale } of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`${base}#${section}`);
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
