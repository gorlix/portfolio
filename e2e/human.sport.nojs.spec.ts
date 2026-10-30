import { expect, test } from '@playwright/test';

// Sport senza JavaScript (PORT-88): niente scena, le quattro schede restano sul fondo semplice.
for (const route of ['/human/', '/en/human/']) {
  test(`${route} senza JS: una scheda per attivita, ognuna raggiungibile dalla barra`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.locator('#sport .card')).toHaveCount(4);
    await expect(page.locator('#sport .stage')).toBeHidden();
    for (const slug of ['ski', 'hiking', 'tennis', 'volleyball']) {
      await expect(page.locator(`#sport-${slug}`)).toBeVisible();
      await expect(page.locator(`nav[data-timeline] a[href="#sport-${slug}"]`)).toHaveCount(1);
    }
  });
}
