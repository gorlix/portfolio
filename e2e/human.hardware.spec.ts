import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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

    // Trova l'oggetto passando il mouse su una griglia: il primo punto che apre il popup.
    const findPrinter = async (page: Page): Promise<{ x: number; y: number }> => {
      const popup = page.locator('#home [data-hw-pop="printer"]');
      const box = await page.locator('[data-scene="scrivania"] canvas').boundingBox();
      if (!box) throw new Error('canvas assente');
      for (let y = 0.45; y < 0.85; y += 0.05) {
        for (let x = 0.7; x < 0.98; x += 0.04) {
          const at = { x: box.x + box.width * x, y: box.y + box.height * y };
          await page.mouse.move(at.x, at.y);
          if (await popup.isVisible()) return at;
        }
      }
      throw new Error('stampante non trovata');
    };

    test('il mouse va dall’oggetto al link senza che il popup si chiuda', async ({ page }) => {
      test.setTimeout(90_000);
      const popup = page.locator('#home [data-hw-pop="printer"]');
      await findPrinter(page);
      const link = popup.getByRole('link');
      await expect(link).toHaveAttribute('href', links.printer);
      const target = await link.boundingBox();
      if (!target) throw new Error('link assente');
      // Movimento lento (a passi) verso il link, come una mano vera.
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 25,
      });
      await page.waitForTimeout(700);
      await expect(popup).toBeVisible();
      await link.hover();
      await expect(link).toBeVisible();
      // Uscendo dal popup verso il vuoto si chiude, con ritardo.
      await page.mouse.move(5, 5, { steps: 4 });
      await expect(popup).toBeHidden({ timeout: 3000 });
    });

    test('il click sull’oggetto fissa il popup fino a un click fuori', async ({ page }) => {
      test.setTimeout(90_000);
      const popup = page.locator('#home [data-hw-pop="printer"]');
      const at = await findPrinter(page);
      await page.mouse.click(at.x, at.y);
      const box = await page.locator('[data-scene="scrivania"] canvas').boundingBox();
      if (!box) throw new Error('canvas assente');
      // Il mouse se ne va nel vuoto: il popup fisso resta.
      await page.mouse.move(box.x + 4, box.y + 4, { steps: 5 });
      await page.waitForTimeout(800);
      await expect(popup).toBeVisible();
      // Un click fuori (sul vuoto del canvas) lo chiude.
      await page.mouse.click(box.x + 4, box.y + 4);
      await expect(popup).toBeHidden();
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
