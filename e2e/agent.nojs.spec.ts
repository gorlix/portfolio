import { expect, test } from '@playwright/test';

for (const route of ['/agent/', '/en/agent/']) {
  test.describe(route, () => {
    test('console con avvio, voci descrittive, file grezzi e download', async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
      await expect(page.locator('ul.boot li')).toHaveCount(5);
      await expect(page.locator('ul.entries li')).toHaveCount(5);
      await expect(page.locator('details > pre > code')).toHaveCount(3);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha');
      for (const file of ['llms.txt', 'profile.json', 'agent.md', 'robots.txt', 'sitemap.xml']) {
        await expect(page.locator(`a[href="/${file}"][download]`).first()).toBeVisible();
      }
    });

    test('i file grezzi si aprono senza JS', async ({ page }) => {
      await page.goto(route);
      const first = page.locator('details').first();
      await expect(first.locator('pre')).toBeHidden();
      await first.locator('summary').click();
      await expect(first.locator('pre')).toBeVisible();
    });

    test('link ai percorsi e alla scelta', async ({ page }) => {
      await page.goto(route);
      const prefix = route.startsWith('/en/') ? '/en' : '';
      for (const target of [`${prefix}/human/`, `${prefix}/recruiter/`, `${prefix}/`]) {
        await expect(page.locator(`header a[href="${target}"]`)).toHaveCount(1);
      }
    });
  });
}
