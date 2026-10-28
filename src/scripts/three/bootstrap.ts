import {
  type CapabilityInput,
  decideTier,
  isBatteryLow,
  probeCapabilities,
  renderProfile,
  type SceneTier,
} from './capabilities';
import { sceneKind } from './kinds';
import { type Box, isOnScreen, pickActive, scrollProgress } from './progress';
import { isSceneName, type SceneState, sceneLoaders, shouldAnimate } from './registry';
import { isInteractive, snapPosition, stageOpacity, storyPosition } from './story';
import type { SceneInstance } from './types';

/*
 * Caricamento pigro delle scene 3D di /human (spec §3.5 e §10). Incluso solo da Scene.astro.
 * Nessun import statico di three: ogni scena arriva con `import()` quando la sua sezione si avvicina,
 * e mai prima che l'utente faccia qualcosa (scroll, tasto, tocco): il primo caricamento resta leggero
 * anche con una scena nella prima schermata. Unica eccezione la scena della Home (`data-autostart`),
 * che parte da sola a pagina caricata e inattiva.
 * Il testo della sezione e gia nell'HTML: se qualcosa manca o fallisce, resta quello.
 *
 * Micro-scene (./kinds.ts): avanzano con la posizione del riquadro nel viewport, letta su `scroll`
 * passivo. Lo scroll non viene mai bloccato ne spostato; una sola micro-scena attiva per volta.
 *
 * Sezioni immersive (`[data-story]`, PORT-76): sfondo fisso con la scena, prima schermata e schede
 * (`[data-moment]`). Sullo stesso scroll passivo si calcola la posizione del racconto (./story.ts):
 * la sezione riceve `data-phase` (hero | cards) e `--stage-opacity` anche prima che il 3D arrivi,
 * e la scena montata riceve la posizione per guidare camera e layer.
 */

/** Margine di anticipo: si carica quando la sezione e a circa uno schermo di distanza. */
const NEAR_MARGIN = '100% 0px 100% 0px';
/**
 * Segnali che l'utente sta usando la pagina: da qui in poi le scene possono caricarsi.
 * Niente `pointermove`: il browser lo emette anche da solo al caricamento, col puntatore fermo.
 */
const ENGAGE_EVENTS = ['scroll', 'wheel', 'keydown', 'pointerdown', 'touchstart'];

/** Attesa massima (ms) dopo `load` prima di avviare le scene `data-autostart`. */
const AUTOSTART_DELAY = 1500;

let capabilities: CapabilityInput | undefined;
/** Le capacita si misurano una volta sola, al primo avvicinamento di una scena. */
const tierFor = (name: string): SceneTier => {
  capabilities ??= probeCapabilities();
  // La batteria cambia nel tempo e la sua API risponde in ritardo: si rilegge a ogni decisione.
  return decideTier({ ...capabilities, lowBattery: isBatteryLow() }, sceneKind(name));
};

const setState = (el: HTMLElement, state: SceneState): void => {
  el.dataset.sceneState = state;
};

/** Perche una scena ripiega sul testo: lo legge l'avviso del poster (Home) via CSS. */
type FallbackReason = 'webgl' | 'savedata' | 'error';

/** Il riquadro sparisce: resta solo il testo della sezione (e, nella Home, il poster). */
const toText = (el: HTMLElement, reason: FallbackReason = 'error'): void => {
  setState(el, 'text');
  el.dataset.sceneReason = reason;
  el.hidden = true;
};

const mounted = new Map<HTMLElement, () => void>();

/** Blocco JSON della scena: gli stessi dati dell'equivalente testuale. */
const readData = (el: HTMLElement): unknown => {
  const block = el.querySelector('script[data-scene-data]');
  return block?.textContent ? JSON.parse(block.textContent) : undefined;
};

// --- Micro-scene guidate dallo scroll -------------------------------------------------------------

interface MicroEntry {
  instance: SceneInstance;
  visible: boolean;
}
const micros = new Map<HTMLElement, MicroEntry>();
let syncFrame = 0;

const box = (el: HTMLElement): Box => {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, height: rect.height };
};

/** Misura i riquadri a schermo, passa l'avanzamento e tiene accesa solo la scena attiva. */
const syncMicros = (): void => {
  syncFrame = 0;
  const viewport = window.innerHeight;
  const entries = [...micros].filter(([, entry]) => entry.visible);
  const boxes = entries.map(([el]) => box(el));
  const active = document.hidden ? -1 : pickActive(boxes, viewport);
  entries.forEach(([el, { instance }], i) => {
    const b = boxes[i] as Box;
    if (!isOnScreen(b, viewport)) return;
    const progress = scrollProgress(b, viewport);
    el.dataset.sceneProgress = progress.toFixed(2);
    instance.setProgress?.(progress);
    if (i === active) {
      instance.start();
      setState(el, 'running');
    } else {
      instance.stop();
      setState(el, 'paused');
    }
  });
};

// --- Sezioni immersive guidate dalle schede -------------------------------------------------------

interface Story {
  section: HTMLElement;
  moments: HTMLElement[];
  /** Scena montata nello sfondo, con il suo livello; assente finche non arriva (o se e solo testo). */
  scene?: { instance: SceneInstance; level: SceneTier };
}
const stories: Story[] = [];

const centre = (el: HTMLElement): number => {
  const rect = el.getBoundingClientRect();
  return rect.top + rect.height / 2;
};

/** Posizione del racconto di ogni sezione immersiva vicina al viewport, verso CSS e scena. */
const syncStories = (): void => {
  const viewport = window.innerHeight;
  for (const story of stories) {
    const rect = story.section.getBoundingClientRect();
    // Lontana dallo schermo: niente da aggiornare (e niente letture di layout inutili).
    if (rect.bottom < -viewport || rect.top > viewport * 2) continue;
    const position = storyPosition(story.moments.map(centre), viewport / 2);
    const interactive = isInteractive(position);
    const level = story.scene?.level;
    story.section.dataset.phase = interactive ? 'hero' : 'cards';
    story.section.dataset.moment = story.moments[snapPosition(position)]?.dataset.moment ?? '';
    // Statico (reduced-motion, deboli): niente dissolvenze, lo sfondo resta pieno.
    const opacity = level === 'reduced' ? 1 : stageOpacity(rect.top, rect.bottom, viewport);
    story.section.style.setProperty('--stage-opacity', opacity.toFixed(3));
    if (story.scene)
      story.scene.instance.setStory?.(
        level === 'full' ? position : snapPosition(position),
        interactive,
      );
  }
};

const syncAll = (): void => {
  syncMicros();
  syncStories();
};

/** Un solo calcolo per fotogramma, e solo se c'e qualcosa da aggiornare. */
const scheduleSync = (): void => {
  if (syncFrame) return;
  if (stories.length > 0) {
    syncFrame = requestAnimationFrame(syncAll);
    return;
  }
  for (const entry of micros.values()) {
    if (entry.visible) {
      syncFrame = requestAnimationFrame(syncAll);
      return;
    }
  }
};

// --- Montaggio ------------------------------------------------------------------------------------

async function mountScene(el: HTMLElement): Promise<void> {
  const name = el.dataset.scene;
  if (!isSceneName(name)) {
    toText(el);
    return;
  }
  const level = tierFor(name);
  if (level === 'text') {
    toText(el, capabilities?.saveData ? 'savedata' : 'webgl');
    return;
  }
  const micro = sceneKind(name) === 'micro' && level === 'full';
  const story = stories.find((s) => s.section.contains(el));

  setState(el, 'loading');
  let instance: SceneInstance;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  try {
    const module = await sceneLoaders[name]();
    // Nel frattempo l'utente puo aver chiesto meno movimento: si riparte col livello nuovo.
    if (tierFor(name) !== level) {
      void mountScene(el);
      return;
    }
    el.append(canvas);
    const profile = renderProfile(level, capabilities ?? {});
    el.dataset.sceneDetail = profile.antialias ? 'high' : 'low';
    const moments = story?.moments.map((m) => m.dataset.moment ?? '');
    instance = module.mount({
      canvas,
      container: el,
      tier: level,
      profile,
      data: readData(el),
      ...(moments && { moments }),
    });
  } catch {
    canvas.remove();
    setState(el, 'error');
    toText(el);
    return;
  }

  let visible = false;
  const update = (): void => {
    if (micro) {
      const entry = micros.get(el);
      if (entry) entry.visible = visible;
      // Fuori schermo o scheda nascosta: ferma subito; il calcolo dello scroll decide il resto.
      if (!visible || document.hidden) {
        instance.stop();
        setState(el, 'paused');
      }
      scheduleSync();
      return;
    }
    if (shouldAnimate(level, visible, document.hidden)) {
      instance.start();
      setState(el, 'running');
    } else {
      instance.stop();
      setState(el, level === 'full' ? 'paused' : 'static');
    }
  };

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    instance.resize(Math.round(width), Math.round(height));
  });
  resize.observe(el);

  // Pausa fuori schermo: nessun requestAnimationFrame quando il riquadro non si vede.
  const view = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    update();
  });
  view.observe(el);

  const onVisibility = (): void => update();
  document.addEventListener('visibilitychange', onVisibility);
  if (micro) micros.set(el, { instance, visible });
  if (story) {
    story.scene = { instance, level };
    syncStories();
  }

  const dispose = (): void => {
    view.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    micros.delete(el);
    if (story?.scene?.instance === instance) delete story.scene;
    instance.dispose();
    canvas.remove();
    mounted.delete(el);
  };
  // Contesto perso (GPU reimpostata, troppe pagine 3D): si torna al testo, senza riprovare.
  const onContextLost = (): void => {
    dispose();
    toText(el);
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  mounted.set(el, dispose);
  update();
}

/** L'URL punta a una sezione che contiene una scena (o a una scena stessa). */
function hashHasScene(): boolean {
  if (!location.hash) return false;
  let id: string;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return false;
  }
  const target = document.getElementById(id);
  return !!target && (target.matches('[data-scene]') || !!target.querySelector('[data-scene]'));
}

function init(): void {
  for (const section of document.querySelectorAll<HTMLElement>('[data-story]')) {
    const moments = [...section.querySelectorAll<HTMLElement>('[data-moment]')];
    if (moments.length > 0) stories.push({ section, moments });
  }
  // Fase e opacita gia giuste al primo disegno (anche ricaricando a meta pagina).
  syncStories();
  const containers = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (containers.length === 0) return;
  if (!('IntersectionObserver' in window) || !('ResizeObserver' in window)) {
    for (const el of containers) toText(el);
    return;
  }

  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        near.unobserve(el);
        void mountScene(el);
      }
    },
    { rootMargin: NEAR_MARGIN },
  );
  for (const el of containers) setState(el, 'idle');

  const engage = (): void => {
    for (const type of ENGAGE_EVENTS) removeEventListener(type, engage, true);
    for (const el of containers) if (el.dataset.sceneState === 'idle') near.observe(el);
  };
  // Pagina gia scorsa (ricarica) o aperta su una sezione con la sua scena (`/human#homelab`):
  // l'utente e gia dentro e non ha motivo di fare un gesto per vedere il 3D. Senza hash, il 3D
  // aspetta ancora il primo gesto.
  if (window.scrollY > 0 || hashHasScene()) engage();
  else
    for (const type of ENGAGE_EVENTS)
      addEventListener(type, engage, { capture: true, passive: true });

  // Scena della prima schermata (`data-autostart`): e gia davanti agli occhi, quindi non aspetta
  // un gesto. Parte comunque solo dopo il primo contenuto visibile: a pagina caricata e al primo
  // momento di calma, cosi il testo in vetro e subito leggibile e il 3D non gli passa davanti.
  const autostart = containers.filter((el) => el.hasAttribute('data-autostart'));
  if (autostart.length > 0) {
    const begin = (): void => {
      for (const el of autostart) if (el.dataset.sceneState === 'idle') near.observe(el);
    };
    const whenIdle = (): void => {
      if ('requestIdleCallback' in window) requestIdleCallback(begin, { timeout: AUTOSTART_DELAY });
      else setTimeout(begin, AUTOSTART_DELAY);
    };
    if (document.readyState === 'complete') whenIdle();
    else addEventListener('load', whenIdle, { once: true });
  }

  // Solo lettura della posizione: passivo, non puo ne bloccare ne ritardare lo scroll.
  addEventListener('scroll', scheduleSync, { passive: true });
  addEventListener('resize', scheduleSync, { passive: true });

  // Meno movimento chiesto a pagina aperta: le scene interattive lasciano il testo, le micro-scene
  // gia montate si rimontano come fotogramma statico finale.
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (!event.matches) return;
    capabilities = { ...(capabilities ?? probeCapabilities()), reducedMotion: true };
    for (const [el, dispose] of [...mounted]) {
      dispose();
      if (tierFor(el.dataset.scene ?? '') !== 'text') void mountScene(el);
    }
    for (const el of containers) {
      if (tierFor(el.dataset.scene ?? '') !== 'text') continue;
      near.unobserve(el);
      toText(el);
    }
  });

  // Uscita vera dalla pagina (non bfcache): si libera tutto.
  addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    for (const dispose of [...mounted.values()]) dispose();
  });
}

init();
