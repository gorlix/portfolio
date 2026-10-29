import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Popup sull'hardware della scrivania (Home di /human, PORT-84). I link sono quelli forniti da
// Alessandro: qui sono verificati alla lettera, in italiano e in inglese, anche senza JavaScript.
const links = {
  printer: 'https://www.printables.com/@Gorlix_50644',
  trackball: 'https://github.com/gorlix/my-adept',
  moonlander: 'https://configure.zsa.io/moonlander/layouts/0olR6/latest/0',
} as const;

const routes = ['/human/', '/en/human/'];

test.describe('senza JS: l’elenco di testo con i link', () => {
  test.use({ javaScriptEnabled: false });
  for (const route of routes) {
    test(`${route}: i tre link esistono con l'href esatto`, async ({ page }) => {
      await page.goto(route);
      for (const href of Object.values(links))
        await expect(page.locator(`#home .hw-text a[href="${href}"]`)).toHaveCount(1);
      // Monitor, mini-server e finestra: nessun link.
      await expect(page.locator('#home .hw-text li')).toHaveCount(6);
      await expect(page.locator('#home .hw-text a')).toHaveCount(3);
    });
  }
});

for (const route of routes) {
  test.describe(`${route} con il 3D`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route);
      await expect
        .poll(() => page.locator('[data-scene="scrivania"]').getAttribute('data-scene-state'), {
          timeout: 15_000,
        })
        .toMatch(/running|paused|static/);
    });

    test('i link dei popup hanno l’href esatto', async ({ page }) => {
      for (const href of Object.values(links))
        await expect(page.locator(`#home [data-hw-pop] a[href="${href}"]`)).toHaveCount(1);
      await expect(page.locator('#home [data-hw-text]')).toBeHidden();
    });

    test('da tastiera il pulsante della stampante apre il popup col link, Esc lo chiude', async ({
      page,
    }) => {
      const button = page.locator('#home [data-hw-open="printer"]');
      const popup = page.locator('#home [data-hw-pop="printer"]');
      await expect(button).toBeVisible();
      await expect(popup).toBeHidden();
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(popup).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(popup.locator('[data-hw-heading]')).toBeFocused();
      const link = popup.getByRole('link');
      await expect(link).toHaveAttribute('href', links.printer);
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    test('il mouse sull’oggetto apre il popup e lo lascia raggiungere', async ({ page }) => {
      test.setTimeout(90_000);
      const popup = page.locator('#home [data-hw-pop="printer"]');
      const box = await page.locator('[data-scene="scrivania"] canvas').boundingBox();
      if (!box) throw new Error('canvas assente');
      // Cerca l'oggetto passando il mouse su una griglia: il primo che apre il popup della stampante.
      let found = false;
      for (let y = 0.45; y < 0.85 && !found; y += 0.05) {
        for (let x = 0.7; x < 0.98 && !found; x += 0.04) {
          await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
          found = await popup.isVisible();
        }
      }
      expect(found).toBe(true);
      const pop = await popup.boundingBox();
      if (!pop) throw new Error('popup assente');
      await page.mouse.move(pop.x + pop.width / 2, pop.y + pop.height / 2, { steps: 6 });
      await page.waitForTimeout(500);
      await expect(popup).toBeVisible();
    });

    test('axe pulito con un popup aperto', async ({ page }) => {
      await page.locator('#home [data-hw-open="moonlander"]').click();
      await expect(page.locator('#home [data-hw-pop="moonlander"]')).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .include('#home')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations, violations.map((v) => v.id).join(', ')).toEqual([]);
    });
  });
}
