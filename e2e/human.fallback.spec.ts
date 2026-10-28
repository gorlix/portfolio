import { expect, type Page, test } from '@playwright/test';

// Fallback 3D (PORT-68): telefono, dispositivo debole, CPU lenta, batteria bassa.
const scene = (page: Page) => page.locator('[data-scene="homelab"]');
const nearScene = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-scene="homelab"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3);
  });

for (const route of ['/human/', '/en/human/']) {
  test.describe(`${route} su telefono`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('scena animata a dettaglio ridotto, senza scroll orizzontale', async ({ page }) => {
      await page.goto(route);
      await nearScene(page);
      await expect(scene(page)).toHaveAttribute('data-scene-state', /running|paused/);
      await expect(scene(page)).toHaveAttribute('data-scene-detail', 'low');
      const canvas = scene(page).locator('canvas');
      await expect(canvas).toBeAttached();
      // Pixel ratio limitato a 1,5: il buffer non supera 1,5 volte la misura CSS.
      const ratio = await canvas.evaluate((c: HTMLCanvasElement) => c.width / c.clientWidth);
      expect(ratio).toBeLessThanOrEqual(1.5 + 0.01);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('il canvas lascia lo scroll verticale alla pagina (controlli tattili semplici)', async ({
      page,
    }) => {
      await page.goto(route);
      await nearScene(page);
      await expect(scene(page).locator('canvas')).toBeAttached();
      const touchAction = await scene(page)
        .locator('canvas')
        .evaluate((c) => getComputedStyle(c).touchAction);
      expect(touchAction).toBe('pan-y');
    });
  });

  test.describe(`${route} dispositivo debole o batteria bassa`, () => {
    test('poca memoria: scena statica (un fotogramma), nessun ciclo di animazione', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true });
      });
      await page.goto(route);
      await nearScene(page);
      await expect(scene(page)).toHaveAttribute('data-scene-state', 'static');
      await expect(scene(page)).toHaveAttribute('data-scene-detail', 'low');
    });

    test('batteria sotto soglia e non in carica: scena statica', async ({ page }) => {
      await page.addInitScript(() => {
        const battery = Object.assign(new EventTarget(), { level: 0.1, charging: false });
        Object.defineProperty(navigator, 'getBattery', {
          value: () => Promise.resolve(battery),
          configurable: true,
        });
      });
      await page.goto(route);
      // La Battery API risponde in modo asincrono: la prima decisione e dopo il primo gesto.
      await page.waitForTimeout(200);
      await nearScene(page);
      await expect(scene(page)).toHaveAttribute('data-scene-state', 'static');
    });

    test('batteria bassa ma in carica: scena animata', async ({ page }) => {
      await page.addInitScript(() => {
        const battery = Object.assign(new EventTarget(), { level: 0.1, charging: true });
        Object.defineProperty(navigator, 'getBattery', {
          value: () => Promise.resolve(battery),
          configurable: true,
        });
      });
      await page.goto(route);
      await page.waitForTimeout(200);
      await nearScene(page);
      await expect(scene(page)).toHaveAttribute('data-scene-state', /running|paused/);
    });

    test('CPU rallentata 6x: la pagina resta utilizzabile e il testo e raggiungibile', async ({
      page,
    }) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await page.goto(route);
      await nearScene(page);
      await expect(page.locator('#homelab h2')).toBeVisible();
      await expect(scene(page)).toHaveAttribute('data-scene-state', /running|paused|static/);
    });
  });
}
