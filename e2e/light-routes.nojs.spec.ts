import { expect, test } from '@playwright/test';
import { lightRoutes } from './routes';

for (const route of lightRoutes) {
  test.describe(route, () => {
    test('si carica e mostra struttura e selettore lingua senza JS', async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);

      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        route.startsWith('/en/') ? 'en' : 'it',
      );
      await expect(page.locator('main#main')).toBeAttached();
      // Nessuno script inline eseguibile (CSP; il JSON-LD e solo dati); l'unico script ammesso e il file esterno dell'ingresso.
      await expect(page.locator('script:not([src]):not([type="application/ld+json"])')).toHaveCount(
        0,
      );

      const switcher = page
        .getByRole('navigation', { name: route.startsWith('/en/') ? 'Language' : 'Lingua' })
        .getByRole('link');
      await expect(switcher).toHaveCount(2);
    });

    test('il selettore lingua porta alla gemella', async ({ page }) => {
      await page.goto(route);
      const isEn = route.startsWith('/en/');
      await page.getByRole('link', { name: isEn ? 'Italiano' : 'English' }).click();
      await expect(page).toHaveURL(isEn ? route.replace(/^\/en/, '') : `/en${route}`);
    });

    test('il link "salta al contenuto" porta al main', async ({ page }) => {
      await page.goto(route);
      await page.locator('.skip').focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#main$/);
    });
  });
}
