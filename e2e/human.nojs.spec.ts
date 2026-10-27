import { expect, test } from '@playwright/test';

const sectionIds = [
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

for (const [route, lang] of [
  ['/human/', 'it'],
  ['/en/human/', 'en'],
] as const) {
  test.describe(`${route} senza JS`, () => {
    test('nove sezioni nell’ordine della spec, un solo h1, landmark', async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toEqual(sectionIds);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(8);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
    });

    test('ogni voce del menu punta a una sezione e le ancore sono condivisibili', async ({
      page,
    }) => {
      await page.goto(route);
      const hrefs = await page
        .locator('header nav[aria-label] a[href^="#"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs).toEqual(sectionIds.map((id) => `#${id}`));
      await page.goto(`${route}#homelab`);
      await expect(page).toHaveURL(/#homelab$/);
      await expect(page.locator('section#homelab')).toBeInViewport();
    });

    test('il contenuto testuale c’è: homelab (tabella), segnaposto e contatti', async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.locator('#homelab table tbody tr')).toHaveCount(3);
      await expect(page.getByText('TODO(Alessandro)').first()).toBeVisible();
      await expect(page.locator('#contatti a[href^="mailto:"]')).toHaveCount(1);
    });

    test('nessun IP o hostname reale nel testo', async ({ page }) => {
      await page.goto(route);
      const body = await page.locator('main').textContent();
      expect(body).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(body).not.toMatch(/\.alessandrogorla\.it/);
    });
  });
}
