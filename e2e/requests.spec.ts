import { expect, test } from '@playwright/test';
import { lightRoutes } from './routes';

// Nessun JS, 3D o analitica sui percorsi leggeri (regole d'oro 3, spec §2 e §3.5).
const forbidden = [
  /three/i,
  /\.(glb|gltf|ktx2|basis|hdr|exr)(\?|$)/i,
  /draco|meshopt|webgl/i,
  // Bootstrap e chunk delle scene 3D (src/scripts/three): solo /human.
  /\/_astro\/(Scene\.astro|homelab)[^/]*\.js/i,
  /cloudflareinsights/i,
];

for (const route of lightRoutes) {
  test(`nessuna richiesta JS, 3D o analitica su ${route}`, async ({ page }) => {
    const requested: { url: string; type: string }[] = [];
    page.on('request', (r) => requested.push({ url: r.url(), type: r.resourceType() }));

    await page.goto(route, { waitUntil: 'networkidle' });

    // Unico script ammesso: il file esterno dell'ingresso, dello stesso sito.
    const scripts = requested.filter((r) => r.type === 'script');
    expect(scripts.length).toBeLessThanOrEqual(1);
    for (const s of scripts) expect(new URL(s.url).pathname).toMatch(/^\/_astro\/.+\.js$/);
    expect(requested.filter((r) => forbidden.some((re) => re.test(r.url)))).toEqual([]);
  });
}
