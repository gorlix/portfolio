import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Sezione immersiva (spec §7.3, PORT-76): sfondo 3D fisso, prima schermata con i comandi,
// schede in vetro che guidano camera e layer. Lo scroll resta sempre quello nativo.
const section = (page: Page) => page.locator('#homelab');
const scene = (page: Page) => page.locator('[data-scene="homelab"]');
const momentNames = ['overview', 'nodes', 'decisions', 'failover', 'backup', 'wip', 'projects'];

/** Porta la scheda (o la prima schermata) al centro del viewport con lo scroll della pagina. */
const centre = (page: Page, moment: string) =>
  page.evaluate((name) => {
    const el = document.querySelector(`#homelab [data-moment="${name}"]`) as HTMLElement;
    const rect = el.getBoundingClientRect();
    const offset =
      name === 'overview'
        ? (document.querySelector('#homelab') as HTMLElement).getBoundingClientRect().top
        : rect.top + rect.height / 2 - window.innerHeight / 2;
    window.scrollBy(0, offset);
  }, moment);

for (const route of ['/human/', '/en/human/']) {
  test(`${route}: prima schermata e una scheda per momento, nell'ordine dello storyboard`, async ({
    page,
  }) => {
    await page.goto(route);
    const names = await section(page)
      .locator('[data-moment]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.moment));
    expect(names).toEqual(momentNames);
    await expect(section(page).locator('.card')).toHaveCount(momentNames.length - 1);
    // Il titolo resta un h2 vero; ogni scheda ha il suo h3.
    await expect(section(page).locator('> h2')).toHaveCount(1);
    for (const card of await section(page).locator('.card').all())
      await expect(card.locator('h3').first()).toBeVisible();
  });

  test(`${route}: scorrendo, fase e momento seguono le schede e il 3D smette di catturare i gesti`, async ({
    page,
  }) => {
    await page.goto(route);
    await centre(page, 'overview');
    await expect(section(page)).toHaveAttribute('data-phase', 'hero');
    await expect(section(page).locator('[data-panel-ui]')).toBeVisible();
    await expect
      .poll(() =>
        scene(page)
          .locator('canvas')
          .evaluate((c) => getComputedStyle(c).pointerEvents),
      )
      .toBe('auto');

    for (const name of momentNames.slice(1)) {
      await centre(page, name);
      await expect(section(page)).toHaveAttribute('data-phase', 'cards');
      await expect(section(page)).toHaveAttribute('data-moment', name);
    }
    expect(
      await scene(page)
        .locator('canvas')
        .evaluate((c) => getComputedStyle(c).pointerEvents),
    ).toBe('none');

    // Tornando su, la prima schermata torna usabile.
    await centre(page, 'overview');
    await expect(section(page)).toHaveAttribute('data-phase', 'hero');
  });

  test(`${route}: lo scroll non viene dirottato ne rallentato`, async ({ page }) => {
    await page.goto(route);
    await centre(page, 'overview');
    await expect(scene(page)).toHaveAttribute('data-scene-state', /running|static/);
    // Rotella sopra il canvas della prima schermata: la pagina scorre di quanto chiesto.
    await page.mouse.move(600, 500);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 300);
    // Nessun ascoltatore non passivo di scroll/wheel/touch sulla pagina.
    const blocked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const probe = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 50 });
          document.querySelector('[data-scene="homelab"] canvas')?.dispatchEvent(probe);
          resolve(probe.defaultPrevented);
        }),
    );
    expect(blocked).toBe(false);
  });

  test(`${route}: lontano dalla sezione la scena non chiede fotogrammi`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as Window & { __frames?: number };
      w.__frames = 0;
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        w.__frames = (w.__frames ?? 0) + 1;
        return original(cb);
      };
    });
    await page.goto(route);
    await centre(page, 'nodes');
    await expect(scene(page)).toHaveAttribute('data-scene-state', 'running');
    // In cima: l'avatar finisce la sua breve rincorsa, poi nessun fotogramma (nemmeno dal racconto).
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(scene(page)).toHaveAttribute('data-scene-state', 'paused');
    const frames = () => page.evaluate(() => (window as Window & { __frames?: number }).__frames);
    await expect
      .poll(async () => {
        const before = await frames();
        await page.waitForTimeout(300);
        return (await frames()) === before;
      })
      .toBe(true);
    const before = await frames();
    await page.waitForTimeout(500);
    expect(await frames()).toBe(before);
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`${route}: schede in vetro sopra la scena, axe WCAG 2.2 AA (${colorScheme})`, async ({
      browser,
    }) => {
      // Sei analisi axe con la scena accesa: oltre il tempo standard.
      test.slow();
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(route);
      for (const name of momentNames.slice(1)) {
        await centre(page, name);
        await expect(section(page)).toHaveAttribute('data-moment', name);
        const { violations } = await new AxeBuilder({ page })
          .include(`#homelab [data-moment="${name}"]`)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(violations, `${name}: ${violations.map((v) => v.id).join(', ')}`).toEqual([]);
      }
      await context.close();
    });
  }

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test(`${route}: un fotogramma statico per momento, nessuna dissolvenza`, async ({ page }) => {
      await page.goto(route);
      await centre(page, 'overview');
      await page.mouse.wheel(0, 1);
      await expect(scene(page)).toHaveAttribute('data-scene-state', 'static');
      for (const name of ['nodes', 'failover', 'projects']) {
        await centre(page, name);
        await expect(section(page)).toHaveAttribute('data-moment', name);
        await expect(scene(page)).toHaveAttribute('data-scene-state', 'static');
        expect(
          await section(page).evaluate((s) => s.style.getPropertyValue('--stage-opacity')),
        ).toBe('1.000');
      }
    });
  });
}
