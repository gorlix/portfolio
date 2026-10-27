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
        .locator('header nav[aria-label] > ul > li > a[href^="#"]')
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

    test('prima schermata: saluto, ritratto, avatar riservato e badge verso la sezione collegata', async ({
      page,
    }) => {
      await page.goto(route);
      const home = page.locator('#home');
      await expect(home.locator('.portrait')).toBeVisible();
      await expect(home.locator('.avatar')).toBeVisible();
      const badges = home.locator('nav[aria-label] a[href^="#"]');
      await expect(badges).toHaveCount(8);
      for (const href of await badges.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
        await expect(page.locator(`section${href}`)).toBeAttached();
      }
      await expect(home.locator('a[href="#homelab"]').first()).toHaveText('Ansible');
    });

    test('chiusura: link di ritorno alla scelta (intestazione e fine), contatti completi', async ({
      page,
    }) => {
      await page.goto(route);
      const home = lang === 'en' ? '/en/' : '/';
      await expect(page.locator(`header a[href="${home}"]`)).toHaveCount(1);
      await expect(page.locator(`#contatti .farewell a[href="${home}"]`)).toBeVisible();
      await expect(page.locator('#contatti a[href^="https://github.com"]')).toHaveCount(1);
      await expect(page.locator('#contatti a[href^="https://www.linkedin.com"]')).toHaveCount(1);
      await expect(page.locator('#contatti a[href^="https://x.com"]')).toHaveCount(1);
      await expect(
        page
          .locator('#contatti')
          .getByText(/CV|Résumé/)
          .first(),
      ).toBeVisible();
      // Raggiungibile da tastiera: il link finale prende il focus.
      await page.locator(`#contatti .farewell a[href="${home}"]`).focus();
      await expect(page.locator(`#contatti .farewell a[href="${home}"]`)).toBeFocused();
    });

    test('nessun IP o hostname reale nel testo', async ({ page }) => {
      await page.goto(route);
      const body = await page.locator('main').textContent();
      expect(body).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(body).not.toMatch(/\.alessandrogorla\.it/);
    });
  });
}
