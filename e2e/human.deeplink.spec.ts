import { expect, type Page, test } from '@playwright/test';

// Link diretti a una sezione di /human (spec §7.3): si atterra sulla sezione con l'hash intatto e,
// se la sezione ha una scena, il 3D parte senza aspettare un gesto. Senza hash resta "al primo gesto".
const isThree = (url: string) => /\/_astro\/(three|homelab|avatar)\./.test(url);
const homelabInView = (page: Page) =>
  page.evaluate(() => {
    const rect = (document.querySelector('#homelab') as HTMLElement).getBoundingClientRect();
    return rect.top < innerHeight && rect.bottom > 0;
  });

for (const route of ['/human/', '/en/human/']) {
  test(`${route}#homelab: si atterra sulla sezione e l'hash resta`, async ({ page }) => {
    await page.goto(`${route}#homelab`);
    await page.waitForTimeout(1500);
    expect(await homelabInView(page)).toBe(true);
    expect(await page.evaluate(() => location.hash)).toBe('#homelab');
    await expect(page.locator('nav[data-timeline] a[href="#homelab"]')).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  test(`${route}#homelab: il 3D parte senza gesti`, async ({ page }) => {
    await page.goto(`${route}#homelab`);
    // Con WebGL la scena monta il canvas; senza, il bootstrap l'ha comunque avviata (stato diverso da idle).
    await expect
      .poll(() => page.locator('[data-scene="homelab"]').getAttribute('data-scene-state'), {
        timeout: 15_000,
      })
      .not.toMatch(/^(idle|loading)$/);
    const state = await page.locator('[data-scene="homelab"]').getAttribute('data-scene-state');
    if (state !== 'text' && state !== 'error')
      await expect(page.locator('[data-scene="homelab"] canvas')).toBeAttached();
  });

  test(`${route}#homelab: dopo uno scroll vero l'URL segue di nuovo la pagina`, async ({
    page,
  }) => {
    await page.goto(`${route}#homelab`);
    await page.waitForTimeout(800);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, -20000);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  });

  test(`${route}: senza hash il 3D non parte prima del primo gesto`, async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    expect(urls.filter(isThree)).toEqual([]);
    await expect(page.locator('[data-scene="homelab"]')).toHaveAttribute(
      'data-scene-state',
      'idle',
    );
  });
}
