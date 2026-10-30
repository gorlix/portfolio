import { expect, test } from '@playwright/test';

for (const [route, lang] of [
  ['/recruiter/', 'it'],
  ['/en/recruiter/', 'en'],
] as const) {
  test.describe(route, () => {
    test('struttura: un h1 (apertura), sei h2, sette sezioni, landmark', async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(6);
      await expect(page.locator('main section[id]')).toHaveCount(7);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
    });

    test('ogni voce del menu punta a una sezione esistente', async ({ page }) => {
      await page.goto(route);
      const hrefs = await page
        .locator('header nav[aria-label] a[href^="#"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs).toHaveLength(7);
      for (const href of hrefs) await expect(page.locator(`section${href}`)).toBeAttached();
    });

    test('link a /human, /agent e alla scelta del percorso', async ({ page }) => {
      await page.goto(route);
      const prefix = lang === 'en' ? '/en' : '';
      for (const target of [`${prefix}/human/`, `${prefix}/agent/`, `${prefix}/`]) {
        await expect(page.locator(`header a[href="${target}"]`)).toHaveCount(1);
      }
    });

    test('progetti: 5 in evidenza, homelab per primo, con nota sul metodo', async ({ page }) => {
      await page.goto(route);
      const projects = page.locator('#progetti article');
      await expect(projects).toHaveCount(5);
      await expect(projects.first().getByRole('heading', { level: 3 })).toHaveText('homelab');
      // Il metodo dei progetti non e ancora dichiarato: la riga non compare finche Alessandro non lo fornisce.
      await expect(page.locator('#progetti article', { hasText: 'Paca' })).not.toContainText(
        lang === 'en' ? 'Method' : 'Metodo',
      );
    });

    test('apertura: ritratto, frase e CV (segnaposto finche mancano i file) anche nel menu', async ({
      page,
    }) => {
      await page.goto(route);
      const opening = page.locator('#profilo');
      await expect(opening.locator('.portrait')).toBeVisible();
      await expect(opening.getByText(/R[ée]sum[ée]|CV/)).toBeVisible();
      await expect(
        page
          .locator('header nav')
          .first()
          .getByText(/R[ée]sum[ée]|CV/),
      ).toBeVisible();
    });

    test('i dati mancanti non compaiono: nessun segnaposto e nessuna etichetta vuota', async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page.getByText(/TODO/)).toHaveCount(0);
      await expect(page.locator('#certificazioni .meta', { hasText: /: $/ })).toHaveCount(0);
    });
  });
}
