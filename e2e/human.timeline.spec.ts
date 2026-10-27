import { expect, test } from '@playwright/test';

const sectionIds = [
  'home',
  'lavori',
  'homelab',
  'domotica',
  'certificazioni',
  'sport',
  'interessi',
  'beneficenza',
  'contatti',
];
const current = (page: import('@playwright/test').Page) =>
  page.locator('nav[data-timeline] a[aria-current="location"]');

for (const route of ['/human/', '/en/human/']) {
  test.describe(`${route} barra del tempo`, () => {
    test('un punto per sezione, Sport con tre sotto-segmenti', async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('nav[data-timeline] > ul > li')).toHaveCount(sectionIds.length);
      await expect(page.locator('nav[data-timeline] .subs a')).toHaveCount(3);
      for (const a of await page.locator('nav[data-timeline] a').all()) {
        const id = (await a.getAttribute('href'))?.slice(1);
        await expect(page.locator(`#${id}`)).toBeAttached();
      }
    });

    test('click: salta alla sezione, URL e tappa corrente si aggiornano', async ({ page }) => {
      await page.goto(route);
      await page.locator('nav[data-timeline] > ul > li > a[href="#certificazioni"]').click();
      await expect(page).toHaveURL(/#certificazioni$/);
      await expect(page.locator('#certificazioni')).toBeInViewport();
      await expect(current(page)).toHaveAttribute('href', '#certificazioni');
    });

    test('lo scroll aggiorna barra e URL, tornando in cima si toglie l’hash', async ({ page }) => {
      await page.goto(route);
      await page.locator('#interessi').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const el = document.querySelector('#interessi') as HTMLElement;
        window.scrollTo(0, el.offsetTop + 10);
      });
      await expect(current(page).first()).toHaveAttribute('href', '#interessi');
      await expect(page).toHaveURL(/#interessi$/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(current(page)).toHaveAttribute('href', '#home');
      expect(new URL(page.url()).hash).toBe('');
    });

    test('tastiera: Tab raggiunge le tappe e Invio salta; etichetta ~/ al focus', async ({
      page,
    }) => {
      await page.goto(route);
      const link = page.locator('nav[data-timeline] > ul > li > a[href="#lavori"]');
      await link.focus();
      await expect(link.locator('.label')).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#lavori$/);
    });

    test('lo scroll non è bloccato', async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
      expect(overflow).not.toBe('hidden');
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    });
  });

  test.describe(`${route} mobile`, () => {
    test.use({ viewport: { width: 390, height: 800 } });
    test('il pulsante apre e chiude l’elenco, Escape chiude', async ({ page }) => {
      await page.goto(route);
      const toggle = page.locator('nav[data-timeline] .toggle');
      const list = page.locator('nav[data-timeline] > ul');
      await expect(toggle).toBeVisible();
      await expect(list).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(list).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toBeHidden();
      await toggle.click();
      await list.locator('a[href="#sport"]').click();
      await expect(page).toHaveURL(/#sport$/);
      await expect(list).toBeHidden();
    });
  });
}
