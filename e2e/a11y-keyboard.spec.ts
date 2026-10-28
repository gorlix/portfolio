import { expect, test } from '@playwright/test';
import { heavyRoutes, lightRoutes } from './routes';

// Checklist WCAG 2.2 AA oltre ad axe: cio che l'analisi automatica non vede (PORT-66).
const routes = [...lightRoutes, ...heavyRoutes];

for (const route of routes) {
  test(`${route}: il primo Tab porta al link "salta al contenuto" e lo segue`, async ({ page }) => {
    await page.goto(route);
    await page.keyboard.press('Tab');
    const skip = page.locator('a.skip');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator('main#main')).toHaveCount(1);
  });

  test(`${route}: un solo landmark main e tutti gli interattivi hanno focus visibile`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.getByRole('main')).toHaveCount(1);

    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const outlined = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const shadowed = cs.boxShadow !== 'none';
        return {
          id: `${el.tagName.toLowerCase()}|${el.id}|${el.getAttribute('href') ?? ''}|${el.className}`,
          visible: outlined || shadowed,
          inView:
            r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
        };
      });
      if (!info || seen.has(info.id)) break;
      seen.add(info.id);
      expect(info.visible, `focus non visibile su ${info.id}`).toBe(true);
      expect(info.inView, `focus fuori schermo su ${info.id}`).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  test(`${route}: reflow a 320 px senza scroll orizzontale (zoom 400%)`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`${route}: testo ingrandito al 200% senza perdita (viewport 640 px)`, async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
