import { expect, test } from '@playwright/test';
import { heavyRoutes, lightRoutes } from './routes';

// Pannello CMS (Sveltia) su /admin: raggiungibile, mai indicizzato, invisibile al resto del sito.

test('/admin/ risponde ed e noindex', async ({ request }) => {
  const res = await request.get('/admin/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  expect(html).toContain('/admin/sveltia-cms.js');
});

test('config e Sveltia sono serviti dal sito', async ({ request }) => {
  expect((await request.get('/admin/config.yml')).status()).toBe(200);
  const script = await request.get('/admin/sveltia-cms.js');
  expect(script.status()).toBe(200);
  // Nessun CDN: i font e le lingue riscritti verso copie locali.
  expect(await script.text()).not.toContain('cdn.jsdelivr.net/fontsource');
});

test('/admin non e in sitemap ne in llms.txt, ed e chiuso in robots.txt', async ({ request }) => {
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/admin');
  expect(await (await request.get('/llms.txt')).text()).not.toContain('/admin');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /admin');
});

for (const route of [...lightRoutes, ...heavyRoutes]) {
  test(`${route} non carica ne cita Sveltia`, async ({ page, request }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await page.goto(route, { waitUntil: 'networkidle' });
    expect(requested.filter((u) => /\/admin\/|sveltia/i.test(u))).toEqual([]);
    expect(await (await request.get(route)).text()).not.toMatch(/sveltia|\/admin\//i);
  });
}
