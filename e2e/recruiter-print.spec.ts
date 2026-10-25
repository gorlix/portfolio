import { expect, test } from '@playwright/test';

// Foglio A4 a 96 dpi (794 x 1123 px): stampa e PDF di Chromium.
const a4 = { width: 794, height: 1123 };

for (const route of ['/recruiter/', '/en/recruiter/']) {
  test.describe(`stampa ${route}`, () => {
    test.use({ viewport: a4 });

    test('senza navigazione, con URL dei link e nessun overflow orizzontale', async ({ page }) => {
      await page.goto(route);
      await page.emulateMedia({ media: 'print' });

      await expect(page.locator('header.site-header')).toBeHidden();
      await expect(page.locator('footer')).toBeHidden();

      const external = page.locator('#contatti a[href^="https://"]').first();
      const after = await external.evaluate((a) => getComputedStyle(a, '::after').content);
      expect(after).toContain('https://');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('il PDF ha al massimo 2 pagine A4', async ({ page }) => {
      await page.goto(route);
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? [];
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(2);
    });
  });
}
