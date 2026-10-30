import { expect, test } from '@playwright/test';

// Lavori ad albero e approfondimento Trimind senza JavaScript (PORT-81, PORT-82): niente scena,
// le schede restano testo leggibile sul fondo semplice, i link funzionano.

for (const [route, detail] of [
  ['/human/', '/human/lavori/trimind/'],
  ['/en/human/', '/en/human/lavori/trimind/'],
] as const) {
  test(`${route} senza JS: schede dei lavori visibili e "Approfondisci" raggiungibile`, async ({
    page,
  }) => {
    await page.goto(route);
    const cards = page.locator('#lavori .card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) await expect(card).toBeVisible();
    await expect(page.locator('#lavori .stage')).toBeHidden();
    await expect(page.locator(`#lavori .deeper a[href="${detail}"]`)).toBeVisible();
  });
}

for (const [route, lang] of [
  ['/human/lavori/trimind/', 'it'],
  ['/en/human/lavori/trimind/', 'en'],
] as const) {
  test(`${route} senza JS: tutti i punti del CV, un h1, ritorno ai lavori`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#trimind .stage')).toBeHidden();
    const cards = page.locator('#trimind .card');
    await expect(cards).toHaveCount(5);
    for (const card of await cards.all()) await expect(card).toBeVisible();
    // I sette punti del CV di Trimind, ciascuno una volta.
    await expect(page.locator('#trimind .card > ul:not(.tags) > li')).toHaveCount(7);
    expect(await page.locator('#trimind .tags li').count()).toBeGreaterThan(0);
    await expect(page.locator('#trimind .outro a')).toBeVisible();
  });
}

for (const [route, lang] of [
  ['/human/lavori/open-source/', 'it'],
  ['/en/human/lavori/open-source/', 'en'],
] as const) {
  test(`${route} senza JS: schede dei repository, un h1, ritorno ai lavori`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#open-source .stage')).toBeHidden();
    const cards = page.locator('#open-source .card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) await expect(card).toBeVisible();
    expect(await page.locator('#open-source .repos h3 a').count()).toBeGreaterThan(0);
    await expect(page.locator('#open-source .outro a')).toBeVisible();
  });
}
