import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { heavyRoutes, lightRoutes } from './routes';

// Mocha (scuro) e Latte (chiaro): il contrasto va verificato su entrambi.
for (const colorScheme of ['dark', 'light'] as const) {
  for (const route of [...lightRoutes, ...heavyRoutes]) {
    test(`axe WCAG 2.2 AA: ${route} (${colorScheme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(route);

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
      await context.close();
    });
  }
}

// /human con JS acceso: dopo il primo gesto le scene si montano (canvas, pannelli, barra del tempo)
// e anche quel DOM deve restare pulito.
for (const colorScheme of ['dark', 'light'] as const) {
  for (const route of heavyRoutes) {
    test(`axe WCAG 2.2 AA con scene montate: ${route} (${colorScheme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(route);
      // Scene immersive presenti nella pagina (/human ne ha piu d'una, gli approfondimenti una).
      for (const id of [
        'lavori',
        'homelab',
        'domotica',
        'sport',
        'interessi',
        'trimind',
        'opensource',
      ]) {
        if ((await page.locator(`[data-scene="${id}"]`).count()) === 0) continue;
        await page.evaluate((sceneId) => {
          const el = document.querySelector(`[data-scene="${sceneId}"]`) as HTMLElement;
          window.scrollTo(
            0,
            el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3,
          );
        }, id);
        await expect(page.locator(`[data-scene="${id}"]`)).toHaveAttribute(
          'data-scene-state',
          /running|paused|static/,
        );
      }

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
      await context.close();
    });
  }
}
