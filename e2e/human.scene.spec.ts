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
    const ui = page.locator('#homelab [data-panel-ui]');
    await expect(ui).toBeVisible();

    const node = ui.locator('[data-panel-open]').first();
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

  test(`${route}: failover DNS, layer e metriche simulate`, async ({ page }) => {
    await page.goto(route);
    await nearScene(page);
    await page.evaluate(() => document.querySelector('[data-scene]')?.scrollIntoView());
    await expect.poll(() => state(page)).toBe('running');
    // Da qui in poi la scena e caricata: metriche e log non devono chiedere niente alla rete.
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const ui = page.locator('#homelab [data-panel-ui]');

    // Gesto da tastiera, stato annunciato, pulsante che diventa "ripristina".
    const status = ui.locator('[data-failover-status]');
    await expect(status).toHaveAttribute('role', 'status');
    const before = await status.textContent();
    const failover = ui.locator('[data-failover]');
    await failover.focus();
    await page.keyboard.press('Enter');
    await expect(status).not.toHaveText(before ?? '');
    await expect(failover).toHaveText((await failover.getAttribute('data-stop')) ?? '');
    await page.keyboard.press('Enter');
    await expect(status).toHaveText(before ?? '');

    // Layer: backup spento all'inizio, lavori in corso acceso; si invertono da HTML.
    for (const [layer, initial] of [
      ['backup', 'false'],
      ['wip', 'true'],
    ] as const) {
      const button = ui.locator(`[data-layer="${layer}"]`);
      await expect(button).toHaveAttribute('aria-pressed', initial);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', initial === 'true' ? 'false' : 'true');
    }

    // Metriche e log del nodo: valori numerici, righe che arrivano, nessuna richiesta di rete.
    await ui.locator('[data-panel-open]').first().click();
    const item = ui.locator('[data-panel-item]:visible');
    await expect(item.locator('[data-metric="cpu"]')).toHaveText(/^\d+\.\d$/);
    await expect(item.locator('[data-log] li').first()).toBeVisible({ timeout: 15_000 });
    expect(requests).toEqual([]);
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`${route}: controlli della scena aperti, axe WCAG 2.2 AA (${colorScheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(route);
      await nearScene(page);
      const ui = page.locator('#homelab [data-panel-ui]');
      await expect(ui).toBeVisible();
      await ui.locator('[data-layer="decisions"]').click();
      await ui.locator('[data-panel-open]').first().click();
      const { violations } = await new AxeBuilder({ page })
        .include('#homelab [data-panel-ui]')
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

  test(`${route}: fuori schermo la scena si ferma e non chiede fotogrammi`, async ({ page }) => {
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
    await nearScene(page);
    await page.evaluate(() => document.querySelector('[data-scene]')?.scrollIntoView());
    await expect.poll(() => state(page)).toBe('running');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => state(page)).toBe('paused');
    const frames = () => page.evaluate(() => (window as Window & { __frames?: number }).__frames);
    const before = await frames();
    await page.waitForTimeout(500);
    expect(await frames()).toBe(before);
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
    await expect(page.locator('#homelab [data-panel-ui]')).toBeHidden();
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
