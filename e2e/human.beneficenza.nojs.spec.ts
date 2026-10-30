import { expect, test } from '@playwright/test';

// Beneficenza senza JavaScript (PORT-93): niente scena, le due schede restano sul fondo semplice.
for (const route of ['/human/', '/en/human/']) {
  test(`${route} senza JS: una scheda per voce, ognuna raggiungibile dalla barra`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.locator('#beneficenza .card')).toHaveCount(2);
    await expect(page.locator('#beneficenza .stage')).toBeHidden();
    for (const slug of ['rotaract-abbiategrasso', 'mdio-website']) {
      await expect(page.locator(`#beneficenza-${slug}`)).toBeVisible();
      await expect(page.locator(`nav[data-timeline] a[href="#beneficenza-${slug}"]`)).toHaveCount(
        1,
      );
    }
  });
}
