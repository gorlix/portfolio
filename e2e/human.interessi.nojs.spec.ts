import { expect, test } from '@playwright/test';

// Interessi senza JavaScript (PORT-92): niente scena, le sei schede restano sul fondo semplice.
for (const route of ['/human/', '/en/human/']) {
  test(`${route} senza JS: una scheda per interesse, ognuna raggiungibile dalla barra`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.locator('#interessi .card')).toHaveCount(6);
    await expect(page.locator('#interessi .stage')).toBeHidden();
    for (const slug of ['3d-printing', 'zsa-moonlander', 'supernote', 'obsidian', 'rust', 'food']) {
      await expect(page.locator(`#interessi-${slug}`)).toBeVisible();
      await expect(page.locator(`nav[data-timeline] a[href="#interessi-${slug}"]`)).toHaveCount(1);
    }
  });
}
