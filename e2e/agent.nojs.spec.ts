import { expect, test } from '@playwright/test';

for (const route of ['/agent/', '/en/agent/']) {
  test.describe(route, () => {
    test('mostra i tre file in pre/code, con tabella e link di download', async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
      await expect(page.locator('pre > code')).toHaveCount(3);
      await expect(page.getByRole('table')).toHaveCount(1);
      await expect(page.locator('tbody tr')).toHaveCount(5);
      for (const file of ['llms.txt', 'profile.json', 'agent.md', 'robots.txt', 'sitemap.xml']) {
        await expect(page.locator(`a[href="/${file}"][download]`).first()).toBeVisible();
      }
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
