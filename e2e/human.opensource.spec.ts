import { expect, type Page, test } from '@playwright/test';

// Tappa e pagina Open source (PORT-89): una scheda per gruppo, un momento per scheda, 3D in partenza
// da solo, nessuna chiamata a GitHub dal browser.

const section = (page: Page) => page.locator('#open-source');

/** Porta il momento al centro del viewport con lo scroll della pagina. */
const centre = (page: Page, moment: string) =>
  page.evaluate((name) => {
    const el = document.querySelector(`#open-source [data-moment="${name}"]`) as HTMLElement;
    const rect = el.getBoundingClientRect();
    window.scrollBy(0, rect.top + rect.height / 2 - window.innerHeight / 2);
  }, moment);

for (const [route, page_, home] of [
  ['/human/', '/human/lavori/open-source/', '/human/#lavori'],
  ['/en/human/', '/en/human/lavori/open-source/', '/en/human/#lavori'],
] as const) {
  test(`${route}: l'ultima tappa dei Lavori porta alla pagina Open source`, async ({ page }) => {
    await page.goto(route);
    const cards = page.locator('#lavori .card');
    const last = cards.last();
    await expect(last).toHaveAttribute('data-moment', 'open-source');
    await expect(last.locator('a.button')).toHaveAttribute('href', page_);
  });

  test(`${page_}: schede per gruppo con i link, scena al lavoro, nessuna chiamata a GitHub`, async ({
    page,
  }) => {
    const github: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('github.com')) github.push(r.url());
    });
    await page.goto(page_);
    const scene = page.locator('[data-scene="opensource"]');
    await expect(scene).toHaveAttribute('data-scene-state', 'running');
    const names = await section(page)
      .locator('[data-moment]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.moment));
    expect(names[0]).toBe('overview');
    expect(names.at(-1)).toBe('exit');
    const cards = section(page).locator('.card');
    expect(await cards.count()).toBe(names.length - 2);
    for (const card of await cards.all()) {
      expect(await card.locator('.repos > li').count()).toBeGreaterThan(0);
      for (const link of await card.locator('h3 a').all()) {
        await expect(link).toHaveAttribute('href', /^https:\/\/github\.com\//);
      }
    }
    await centre(page, names[1] as string);
    await expect(section(page)).toHaveAttribute('data-moment', names[1] as string);
    await expect(scene).toHaveAttribute('data-scene-state', 'running');
    await expect(section(page).locator('.outro a')).toHaveAttribute('href', home);
    expect(github).toEqual([]);
  });
}

test('senza WebGL: poster, avviso e schede', async ({ page }) => {
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
  await page.goto('/human/lavori/open-source/');
  await expect(page.locator('[data-scene="opensource"]')).toHaveAttribute(
    'data-scene-state',
    'text',
  );
  await expect(section(page).locator('.poster img')).toBeVisible();
  await expect(section(page).locator('.poster-note [data-reason="webgl"]')).toBeVisible();
  await expect(section(page).locator('.card').first()).toBeVisible();
});
