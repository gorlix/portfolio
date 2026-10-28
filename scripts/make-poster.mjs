// Genera i poster statici della Home di /human (fallback senza WebGL, risparmio dati o JS spento).
// Uso: `pnpm build && pnpm preview --port 4321` in un terminale, poi `node scripts/make-poster.mjs`.
// Cattura la scena `scrivania` sulla prima inquadratura, senza vetro ne intestazione.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4321/human/';
const out = 'src/assets/human';
const sizes = [
  { name: 'poster-desktop', width: 1440, height: 900, scale: 1 },
  { name: 'poster-mobile', width: 390, height: 844, scale: 1 },
];

const browser = await chromium.launch();
for (const { name, width, height, scale } of sizes) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('#home [data-scene="scrivania"][data-scene-state="static"]', {
    timeout: 20_000,
  });
  await page.addStyleTag({
    content:
      'header, nav[data-timeline], #home > :not(.stage) { visibility: hidden !important; } #home .stage { opacity: 1 !important; }',
  });
  await page.locator('#home .stage').screenshot({ path: `${out}/${name}.png` });
  await context.close();
}
await browser.close();
