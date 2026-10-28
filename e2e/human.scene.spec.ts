import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Caricamento pigro del 3D su /human: il bootstrap e i chunk three/homelab
// si richiedono solo vicino alla sezione e solo se il dispositivo lo permette.
const isThree = (url: string) => /\/_astro\/(three|homelab|domotica)\./.test(url);
const scene = (page: Page) => page.locator('[data-scene]').first();
const state = (page: Page) => scene(page).getAttribute('data-scene-state');
const nearScene = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-scene]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight);
  });

for (const route of ['/human/', '/en/human/']) {
  test(`${route}: la scena si carica solo vicino alla sezione`, async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(route, { waitUntil: 'networkidle' });
    expect(await state(page)).toBe('idle');
    expect(urls.filter(isThree)).toEqual([]);

    await nearScene(page);
    await expect.poll(() => state(page)).toMatch(/running|paused|static/);
    expect(urls.filter(isThree).length).toBeGreaterThan(0);
    await expect(scene(page).locator('canvas')).toBeAttached();
  });

  test(`${route}: nodi, pannello e layer Decisioni da tastiera`, async ({ page }) => {
    await page.goto(route);
    await nearScene(page);
    await expect.poll(() => state(page)).toMatch(/running|paused|static/);
    const ui = page.locator('[data-homelab-ui]');
    await expect(ui).toBeVisible();

    const node = ui.locator('[data-node-button]').first();
    const panel = ui.locator('[data-panel]');
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(node).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('[data-panel-heading]:visible')).toBeFocused();
    await expect(panel.locator('[data-panel-adrs]:visible')).toHaveCount(0);

    await ui.locator('[data-layer="decisions"]').click();
    await expect(ui.locator('[data-layer="decisions"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('[data-panel-adrs]:visible a').first()).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/gorlix\/homelab\//,
    );

    await panel.locator('[data-panel-heading]:visible').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(node).toBeFocused();
    await expect(node).toHaveAttribute('aria-expanded', 'false');
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`${route}: controlli della scena aperti, axe WCAG 2.2 AA (${colorScheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(route);
      await nearScene(page);
      const ui = page.locator('[data-homelab-ui]');
      await expect(ui).toBeVisible();
      await ui.locator('[data-layer="decisions"]').click();
      await ui.locator('[data-node-button]').first().click();
      const { violations } = await new AxeBuilder({ page })
        .include('[data-homelab-ui]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
      await context.close();
    });
  }

  test(`${route}: Domotica, stanze e pannello delle automazioni da tastiera`, async ({ page }) => {
    await page.goto(route);
    const el = page.locator('[data-scene="domotica"]');
    await el.evaluate((node) => {
      window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - window.innerHeight);
    });
    await expect.poll(() => el.getAttribute('data-scene-state')).toMatch(/running|paused|static/);
    const ui = page.locator('#domotica [data-panel-ui]');
    await expect(ui).toBeVisible();

    const room = ui.locator('[data-panel-open="studio"]');
    const panel = ui.locator('[data-panel]');
    await room.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-panel-heading]:visible')).toBeFocused();
    await expect(panel.locator('[data-panel-item="studio"] article').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(room).toBeFocused();

    const { violations } = await new AxeBuilder({ page })
      .include('#domotica [data-panel-ui]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });

  test(`${route}: senza WebGL resta il testo e three non viene scaricato`, async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: never[]
      ) {
        if (/webgl/.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...args);
      } as typeof original;
    });
    await page.goto(route, { waitUntil: 'networkidle' });
    await nearScene(page);
    await expect.poll(() => state(page)).toBe('text');
    await expect(scene(page)).toBeHidden();
    await expect(page.locator('#homelab table')).toBeVisible();
    await expect(page.locator('[data-homelab-ui]')).toBeHidden();
    await expect(page.locator('#domotica [data-panel-ui]')).toBeHidden();
    await expect(page.locator('#domotica [data-automation]').first()).toBeVisible();
    expect(urls.filter(isThree)).toEqual([]);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test(`${route}: solo testo, three non viene scaricato`, async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));
      await page.goto(route, { waitUntil: 'networkidle' });
      await nearScene(page);
      await expect.poll(() => state(page)).toBe('text');
      expect(urls.filter(isThree)).toEqual([]);
    });
  });
}
