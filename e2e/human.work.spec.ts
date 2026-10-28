import { expect, type Page, test } from '@playwright/test';

// Lavori ad albero (PORT-81) e approfondimento Trimind (PORT-82): sezioni immersive come Homelab,
// schede generate dai dati, "Approfondisci" solo dove i dati indicano una pagina dedicata.

const lavori = (page: Page) => page.locator('#lavori');
const trimind = (page: Page) => page.locator('#trimind');

/** Porta il momento al centro del viewport con lo scroll della pagina. */
const centre = (page: Page, section: string, moment: string) =>
  page.evaluate(
    ([id, name]) => {
      const el = document.querySelector(`#${id} [data-moment="${name}"]`) as HTMLElement;
      const rect = el.getBoundingClientRect();
      window.scrollBy(0, rect.top + rect.height / 2 - window.innerHeight / 2);
    },
    [section, moment],
  );

const noWebgl = (page: Page) =>
  page.addInitScript(() => {
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

for (const [route, detail] of [
  ['/human/', '/human/lavori/trimind/'],
  ['/en/human/', '/en/human/lavori/trimind/'],
] as const) {
  test(`${route}: una scheda per esperienza, un livello del percorso per scheda, prima schermata e uscita`, async ({
    page,
  }) => {
    await page.goto(route);
    const cards = lavori(page).locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    const names = await lavori(page)
      .locator('[data-moment]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.moment));
    expect(names[0]).toBe('overview');
    expect(names.at(-1)).toBe('exit');
    expect(names).toHaveLength(count + 2);
    // La scena riceve un livello per esperienza, nello stesso ordine delle schede, con gli ostacoli.
    const levels = await page
      .locator('[data-scene="lavori"] script[data-scene-data]')
      .evaluate(
        (el) =>
          (JSON.parse(el.textContent ?? '{}') as { levels: { slug: string; obstacles: string[] }[] })
            .levels,
      );
    expect(levels.map((l) => l.slug)).toEqual(names.slice(1, -1));
    for (const level of levels) expect(level.obstacles.length).toBeGreaterThan(0);
  });

  test(`${route}: "Approfondisci" solo sulle esperienze con pagina dedicata`, async ({ page }) => {
    await page.goto(route);
    const links = lavori(page).locator('.deeper a');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', detail);
    await expect(lavori(page).locator('.chip').first()).toBeVisible();
    await links.click();
    await expect(page).toHaveURL(new RegExp(`${detail}$`));
    await expect(page.locator('h1')).toBeVisible();
  });

  test(`${route}: scorrendo, il momento segue le schede dell'albero`, async ({ page }) => {
    await page.goto(route);
    const names = await lavori(page)
      .locator('.card')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.moment ?? ''));
    for (const name of names) {
      await centre(page, 'lavori', name);
      await expect(lavori(page)).toHaveAttribute('data-phase', 'cards');
      await expect(lavori(page)).toHaveAttribute('data-moment', name);
    }
  });
}

for (const [route, back, twin] of [
  ['/human/lavori/trimind/', '/human/#lavori', '/en/human/lavori/trimind/'],
  ['/en/human/lavori/trimind/', '/en/human/#lavori', '/human/lavori/trimind/'],
] as const) {
  test(`${route}: cinque momenti dopo la prima schermata, ritorno ai lavori, lingua gemella`, async ({
    page,
  }) => {
    await page.goto(route);
    const names = await trimind(page)
      .locator('[data-moment]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.moment));
    expect(names).toEqual(['overview', 'infra', 'backup', 'cicd', 'observability', 'quality']);
    await expect(page.locator('h1')).toHaveCount(1);
    for (const card of await trimind(page).locator('.card').all())
      await expect(card.locator('h2')).toHaveCount(1);
    await expect(page.locator(`header a[href="${back}"]`)).toBeVisible();
    await expect(page.locator(`.outro a[href="${back}"]`)).toBeAttached();
    await expect(page.locator(`header a[hreflang][href="${twin}"]`)).toBeAttached();
  });

  test(`${route}: la mappa parte senza gesti e segue le schede`, async ({ page }) => {
    await page.goto(route);
    const scene = page.locator('[data-scene="trimind"]');
    await expect
      .poll(() => scene.getAttribute('data-scene-state'), { timeout: 15_000 })
      .toMatch(/running|paused/);
    await expect(scene.locator('canvas')).toBeAttached();
    for (const name of ['infra', 'backup', 'cicd', 'observability', 'quality']) {
      await centre(page, 'trimind', name);
      await expect(trimind(page)).toHaveAttribute('data-moment', name);
    }
  });

  test(`${route}: senza WebGL restano poster, avviso e testo`, async ({ page }) => {
    await noWebgl(page);
    await page.goto(route);
    const scene = page.locator('[data-scene="trimind"]');
    await expect
      .poll(() => scene.getAttribute('data-scene-state'), { timeout: 15_000 })
      .toBe('text');
    await expect(trimind(page).locator('.poster img')).toBeVisible();
    await expect(trimind(page).locator('.poster-note [data-reason="webgl"]')).toBeVisible();
    await expect(trimind(page).locator('.card').first()).toBeVisible();
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test(`${route}: mappa ferma, un fotogramma per momento`, async ({ page }) => {
      await page.goto(route);
      const scene = page.locator('[data-scene="trimind"]');
      await expect
        .poll(() => scene.getAttribute('data-scene-state'), { timeout: 15_000 })
        .toBe('static');
      await expect(scene.locator('canvas')).toBeAttached();
    });
  });
}
