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
