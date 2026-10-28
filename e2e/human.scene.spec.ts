import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Caricamento pigro del 3D su /human: il bootstrap e i chunk three/homelab
// si richiedono solo vicino alla sezione e solo se il dispositivo lo permette.
const isThree = (url: string) =>
  /\/_astro\/(three|homelab|domotica|lavori|certificazioni|avatar|figure|beneficenza|contatti|interessi|sci|tennis|pallavolo)\./.test(
    url,
  );
const scene = (page: Page) => page.locator('[data-scene="homelab"]');
const state = (page: Page) => scene(page).getAttribute('data-scene-state');
const nearScene = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-scene="homelab"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight);
  });

const sportSlug = { sci: 'ski', tennis: 'tennis', pallavolo: 'volleyball' } as const;

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
    await page.evaluate(() => document.querySelector('[data-scene="homelab"]')?.scrollIntoView());
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
    await page.evaluate(() => document.querySelector('[data-scene="homelab"]')?.scrollIntoView());
    await expect.poll(() => state(page)).toBe('running');

    // In cima (la scena Contatti, in fondo, sarebbe attiva e chiederebbe fotogrammi). Li c'e
    // l'avatar: la sua breve rincorsa verso l'avanzamento deve finire, poi zero fotogrammi.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => state(page)).toBe('paused');
    const frames = () => page.evaluate(() => (window as Window & { __frames?: number }).__frames);
    await expect
      .poll(async () => {
        const before = await frames();
        await page.waitForTimeout(300);
        return (await frames()) === before;
      })
      .toBe(true);
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
    test(`${route}: Domotica solo testo, Homelab e micro-scene ferme`, async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));
      await page.goto(route, { waitUntil: 'networkidle' });
      await nearScene(page);
      // Homelab immersiva (PORT-76): un fotogramma statico per momento, mai un ciclo di animazione.
      await expect.poll(() => state(page)).toBe('static');
      await expect(scene(page).locator('canvas')).toBeAttached();
      const domotica = page.locator('[data-scene="domotica"]');
      await domotica.scrollIntoViewIfNeeded();
      await expect.poll(() => domotica.getAttribute('data-scene-state')).toBe('text');
      expect(urls.filter((u) => /\/_astro\/domotica\./.test(u))).toEqual([]);

      const lavori = page.locator('[data-scene="lavori"]');
      await lavori.scrollIntoViewIfNeeded();
      await expect.poll(() => lavori.getAttribute('data-scene-state')).toBe('static');
      await expect(lavori.locator('canvas')).toBeAttached();
      // Statica: nessun avanzamento legato allo scroll.
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(200);
      expect(await lavori.getAttribute('data-scene-state')).toBe('static');
      expect(await lavori.getAttribute('data-scene-progress')).toBeNull();

      // Interessi (PORT-63): stessa regola, fotogramma finale con tutti gli oggetti.
      const interessi = page.locator('[data-scene="interessi"]');
      await interessi.scrollIntoViewIfNeeded();
      await expect.poll(() => interessi.getAttribute('data-scene-state')).toBe('static');
      await expect(interessi.locator('canvas')).toBeAttached();
      expect(await interessi.getAttribute('data-scene-progress')).toBeNull();
    });
  });

  test(`${route}: la micro-scena Interessi avanza con lo scroll`, async ({ page }) => {
    await page.goto(route);
    const scene = page.locator('[data-scene="interessi"]');
    const at = (f: number) =>
      scene.evaluate((el, fr) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - window.innerHeight * fr);
      }, f);
    const value = async () =>
      Number((await scene.getAttribute('data-scene-progress')) ?? Number.NaN);
    // Non sul bordo: la scena Sport subito sopra sarebbe piu centrata e resterebbe lei l'attiva.
    await at(0.65);
    await expect.poll(() => scene.getAttribute('data-scene-state')).toBe('running');
    const start = await value();
    await at(0.35);
    await expect.poll(value).toBeGreaterThan(start);
    await at(0.1);
    await expect.poll(value).toBe(1);
  });

  // Micro-scene (PORT-58): avanzamento legato allo scroll, mai scroll bloccato.
  const micro = (page: Page) => page.locator('[data-scene="lavori"]');
  const progress = async (page: Page) =>
    Number((await micro(page).getAttribute('data-scene-progress')) ?? Number.NaN);
  /** Porta il bordo superiore della micro-scena a `fraction` dell'altezza del viewport. */
  const placeMicro = (page: Page, fraction: number) =>
    micro(page).evaluate((el, f) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - window.innerHeight * f);
    }, fraction);

  // Avatar della prima schermata (PORT-59).
  test(`${route}: avatar riservato e fermo prima del primo gesto`, async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const avatar = page.locator('#home .avatar [data-scene="avatar"]');
    await expect(avatar).toHaveAttribute('data-scene-state', 'idle');
    await expect(avatar).toHaveAttribute('role', 'img');
    const box = await page.locator('#home .avatar').boundingBox();
    expect(box?.width).toBe(160);
    expect(box?.height).toBe(160);
    expect(urls.filter(isThree)).toEqual([]);
  });

  test(`${route}: senza WebGL l'avatar sparisce e resta il ritratto`, async ({ page }) => {
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
    await page.mouse.wheel(0, 50);
    await expect
      .poll(() => page.locator('#home [data-scene="avatar"]').getAttribute('data-scene-state'))
      .toBe('text');
    await expect(page.locator('#home .avatar')).toBeHidden();
    await expect(page.locator('#home .portrait')).toBeVisible();
    await expect(page.locator('#home .greeting')).toBeVisible();
  });

  test.describe('avatar con reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test(`${route}: avatar statico sulla posa finale`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.mouse.wheel(0, 50);
      const avatar = page.locator('#home [data-scene="avatar"]');
      await expect.poll(() => avatar.getAttribute('data-scene-state')).toBe('static');
      await expect(avatar.locator('canvas')).toBeAttached();
      expect(await avatar.getAttribute('data-scene-progress')).toBeNull();
    });
  });

  test(`${route}: nessun 3D prima che l'utente usi la pagina`, async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    expect(await micro(page).getAttribute('data-scene-state')).toBe('idle');
    expect(urls.filter(isThree)).toEqual([]);
  });

  test(`${route}: la micro-scena avanza e torna indietro con lo scroll`, async ({ page }) => {
    await page.goto(route);
    // Una sola micro-scena attiva per volta: isola Lavori togliendo l'avatar della prima schermata.
    await page.locator('#home .avatar').evaluate((el) => el.remove());
    await placeMicro(page, 0.9);
    await expect.poll(() => micro(page).getAttribute('data-scene-state')).toBe('running');
    await expect(micro(page).locator('canvas')).toBeAttached();
    const start = await progress(page);

    await placeMicro(page, 0.5);
    await expect.poll(() => progress(page)).toBeGreaterThan(start);
    const middle = await progress(page);

    await placeMicro(page, 0.1);
    await expect.poll(() => progress(page)).toBe(1);

    await placeMicro(page, 0.8);
    await expect.poll(() => progress(page)).toBeLessThan(middle);
  });

  test(`${route}: la micro-scena non blocca ne dirotta lo scroll`, async ({ page }) => {
    await page.goto(route);
    await placeMicro(page, 0.6);
    await expect.poll(() => micro(page).getAttribute('data-scene-state')).toBe('running');
    const canvas = micro(page).locator('canvas');
    expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    // Rotella sopra la scena: la pagina scorre di quanto chiesto, ne piu ne meno.
    const box = await micro(page).boundingBox();
    if (!box) throw new Error('micro-scena senza riquadro');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before + 400);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBe(before + 400);

    await page.mouse.wheel(0, -400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  });

  test(`${route}: fuori schermo la micro-scena si ferma e non chiede fotogrammi`, async ({
    page,
  }) => {
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
    await placeMicro(page, 0.5);
    await expect.poll(() => micro(page).getAttribute('data-scene-state')).toBe('running');
    // Ferma sullo scroll: la rincorsa si assesta e non chiede altri fotogrammi.
    await page.waitForTimeout(800);
    const frames = () => page.evaluate(() => (window as Window & { __frames?: number }).__frames);
    const settled = await frames();
    await page.waitForTimeout(400);
    expect(await frames()).toBe(settled);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => micro(page).getAttribute('data-scene-state')).toBe('paused');
  });

  // Micro-scena Certificazioni (PORT-61): stesso motore, canvas dentro la sezione.
  const certs = (page: Page) => page.locator('[data-scene="certificazioni"]');
  const placeCerts = (page: Page, fraction: number) =>
    certs(page).evaluate((el, f) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - window.innerHeight * f);
    }, fraction);

  test(`${route}: la scena Certificazioni avanza con lo scroll`, async ({ page }) => {
    await page.goto(route);
    await expect(certs(page).locator('script[data-scene-data]')).toBeAttached();
    await placeCerts(page, 0.9);
    await expect.poll(() => certs(page).getAttribute('data-scene-state')).toBe('running');
    await expect(certs(page).locator('canvas')).toBeAttached();
    const read = async () =>
      Number((await certs(page).getAttribute('data-scene-progress')) ?? Number.NaN);
    const start = await read();
    await placeCerts(page, 0.3);
    await expect.poll(read).toBeGreaterThan(start);
  });

  test(`${route}: Certificazioni con reduced-motion e un fotogramma statico`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(route, { waitUntil: 'networkidle' });
    await placeCerts(page, 0.5);
    await expect.poll(() => certs(page).getAttribute('data-scene-state')).toBe('static');
    expect(await certs(page).getAttribute('data-scene-progress')).toBeNull();
    await context.close();
  });

  // Micro-scene sobrie (PORT-64): Beneficenza e Contatti, stesso contratto di Lavori.
  for (const name of ['beneficenza', 'contatti']) {
    const box = (page: Page) => page.locator(`[data-scene="${name}"]`);
    const place = (page: Page, fraction: number) =>
      box(page).evaluate((el, f) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - window.innerHeight * f);
      }, fraction);
    const value = async (page: Page) =>
      Number((await box(page).getAttribute('data-scene-progress')) ?? Number.NaN);

    test(`${route}: micro-scena ${name} avanza con lo scroll e torna indietro`, async ({
      page,
    }) => {
      await page.goto(route);
      await place(page, 0.65);
      await expect.poll(() => box(page).getAttribute('data-scene-state')).toBe('running');
      await expect(box(page).locator('canvas')).toBeAttached();
      const start = await value(page);
      await place(page, 0.3);
      await expect.poll(() => value(page)).toBeGreaterThan(start);
      const later = await value(page);
      await place(page, 0.7);
      await expect.poll(() => value(page)).toBeLessThan(later);
    });

    test.describe(`reduced motion ${name}`, () => {
      test.use({ reducedMotion: 'reduce' });
      test(`${route}: micro-scena ${name} statica sul fotogramma finale`, async ({ page }) => {
        await page.goto(route);
        await box(page).scrollIntoViewIfNeeded();
        await expect.poll(() => box(page).getAttribute('data-scene-state')).toBe('static');
        await expect(box(page).locator('canvas')).toBeAttached();
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(200);
        expect(await box(page).getAttribute('data-scene-state')).toBe('static');
        expect(await box(page).getAttribute('data-scene-progress')).toBeNull();
      });
    });
  }

  test(`${route}: dai contatti il ritorno alla scelta si raggiunge da tastiera`, async ({
    page,
  }) => {
    await page.goto(route);
    const back = page.locator('#contatti .farewell a');
    await page.locator('#contatti a[href^="https://github.com"]').focus();
    for (let i = 0; i < 8 && !(await back.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(route.startsWith('/en') ? /\/en\/$/ : /\/$/);
  });

  // Micro-scene Sport (PORT-62): tre scene vicine, una sola attiva per volta.
  const sportScenes = ['sci', 'tennis', 'pallavolo'] as const;
  const sport = (page: Page, name: string) => page.locator(`[data-scene="${name}"]`);
  const placeSport = (page: Page, name: string, fraction: number) =>
    sport(page, name).evaluate((el, f) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - window.innerHeight * f);
    }, fraction);

  for (const name of sportScenes) {
    test(`${route}: la scena ${name} sta nel suo articolo e avanza con lo scroll`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(
        page.locator(`article#sport-${sportSlug[name]} [data-scene="${name}"]`),
      ).toHaveCount(1);
      // Le tre scene sono vicine: per essere attiva deve stare al centro, non sul bordo.
      await placeSport(page, name, 0.6);
      await expect.poll(() => sport(page, name).getAttribute('data-scene-state')).toBe('running');
      await expect(sport(page, name).locator('canvas')).toBeAttached();
      const read = async () =>
        Number((await sport(page, name).getAttribute('data-scene-progress')) ?? Number.NaN);
      const start = await read();
      await placeSport(page, name, 0.25);
      await expect.poll(read).toBeGreaterThan(start);
    });

    test(`${route}: ${name} con reduced-motion e un fotogramma statico`, async ({ browser }) => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(route, { waitUntil: 'networkidle' });
      await placeSport(page, name, 0.5);
      await expect.poll(() => sport(page, name).getAttribute('data-scene-state')).toBe('static');
      expect(await sport(page, name).getAttribute('data-scene-progress')).toBeNull();
      await context.close();
    });
  }

  test(`${route}: delle tre scene Sport una sola e in esecuzione`, async ({ page }) => {
    await page.goto(route);
    await placeSport(page, 'tennis', 0.5);
    await expect.poll(() => sport(page, 'tennis').getAttribute('data-scene-state')).toBe('running');
    await page.waitForTimeout(300);
    const states = await Promise.all(
      sportScenes.map((n) => sport(page, n).getAttribute('data-scene-state')),
    );
    expect(states.filter((x) => x === 'running')).toHaveLength(1);
    expect(states[1]).toBe('running');
  });
}
