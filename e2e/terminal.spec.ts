import { expect, test } from '@playwright/test';

// Terminale d'ingresso con JavaScript attivo (miglioramento progressivo, PORT-18).
const routes = [
  { route: '/', locale: 'it', twin: '/en/', prefix: '' },
  { route: '/en/', locale: 'en', twin: '/', prefix: '/en' },
];

for (const { route, locale, twin, prefix } of routes) {
  test.describe(route, () => {
    test('i tasti 1/2/3 aprono la scelta corrispondente', async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('2');
      await expect(page).toHaveURL(`${prefix}/recruiter/`);
    });

    test('frecce e Invio: giu seleziona il primo, su dal primo torna all ultimo', async ({
      page,
    }) => {
      await page.goto(route);
      const links = page.locator('[data-choices] a');
      await page.keyboard.press('ArrowDown');
      await expect(links.nth(0)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(links.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(links.nth(2)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${prefix}/agent/`);
    });

    test('il comando lang cambia lingua e la scelta resta ricordata', async ({ page }) => {
      await page.goto(route);
      await page.keyboard.type('lang');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(twin);
      expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe(
        locale === 'it' ? 'en' : 'it',
      );
    });

    test('il pulsante salta mostra subito tutto il testo e poi sparisce', async ({ page }) => {
      await page.goto(route);
      const skip = page.locator('[data-skip]');
      await expect(skip).toBeVisible();
      await skip.click();
      await expect(skip).toBeHidden();
      await expect(page.locator('.rest')).toHaveText(['', '', '', '', '']);
      await expect(page.locator('[data-choices]')).toBeVisible();
    });

    test('con reduced motion niente digitazione e niente pulsante salta', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      await expect(page.locator('[data-skip]')).toBeHidden();
      await expect(page.locator('.rest')).toHaveCount(0);
      await expect(page.locator('[data-choices]')).toBeVisible();
      await expect(page.locator('[data-hint]').first()).toBeVisible();
    });

    test('nessun layout shift durante la digitazione', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
          }[])
            if (!e.hadRecentInput) w.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(route);
      const box = await page.locator('.screen').boundingBox();
      await page.locator('[data-skip]').click();
      const after = await page.locator('.screen').boundingBox();
      // L'altezza del contenuto non cambia tra digitazione e fine (il testo e gia nel layout).
      expect(after?.height).toBeGreaterThanOrEqual(box?.height ?? 0);
      expect(
        await page.evaluate(() => (window as unknown as { __cls: number }).__cls),
      ).toBeLessThan(0.01);
    });
  });
}

test('la lingua ricordata riporta alla versione inglese dalla radice, ma non dall URL inglese', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lang', 'en'));
  await page.goto('/');
  await expect(page).toHaveURL('/en/');

  await page.evaluate(() => localStorage.setItem('lang', 'it'));
  await page.goto('/en/');
  await expect(page).toHaveURL('/en/');
});

test('scegliere la lingua dal selettore la ricorda', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL('/en/');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
});

test('senza localStorage la pagina funziona lo stesso', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await page.goto('/');
  await page.keyboard.press('1');
  await expect(page).toHaveURL('/human/');
});
