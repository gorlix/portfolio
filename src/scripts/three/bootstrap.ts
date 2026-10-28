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
import type { SceneInstance } from './types';

/*
 * Caricamento pigro delle scene 3D di /human (spec §3.5 e §10). Incluso solo da Scene.astro.
 * Nessun import statico di three: ogni scena arriva con `import()` quando la sua sezione si avvicina,
 * e mai prima che l'utente faccia qualcosa (scroll, tasto, tocco): il primo caricamento resta leggero
 * anche con una scena nella prima schermata.
 * Il testo della sezione e gia nell'HTML: se qualcosa manca o fallisce, resta quello.
 *
 * Micro-scene (./kinds.ts): avanzano con la posizione del riquadro nel viewport, letta su `scroll`
 * passivo. Lo scroll non viene mai bloccato ne spostato; una sola micro-scena attiva per volta.
 */

/** Margine di anticipo: si carica quando la sezione e a circa uno schermo di distanza. */
const NEAR_MARGIN = '100% 0px 100% 0px';
/**
 * Segnali che l'utente sta usando la pagina: da qui in poi le scene possono caricarsi.
 * Niente `pointermove`: il browser lo emette anche da solo al caricamento, col puntatore fermo.
 */
const ENGAGE_EVENTS = ['scroll', 'wheel', 'keydown', 'pointerdown', 'touchstart'];

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

/** Il riquadro sparisce: resta solo il testo della sezione. */
const toText = (el: HTMLElement): void => {
  setState(el, 'text');
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

/** Un solo calcolo per fotogramma, e solo se qualche micro-scena e a schermo. */
const scheduleSync = (): void => {
  if (syncFrame) return;
  for (const entry of micros.values()) {
    if (entry.visible) {
      syncFrame = requestAnimationFrame(syncMicros);
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
    toText(el);
    return;
  }
  const micro = sceneKind(name) === 'micro' && level === 'full';

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
    instance = module.mount({ canvas, container: el, tier: level, profile, data: readData(el) });
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

  const dispose = (): void => {
    view.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    micros.delete(el);
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

function init(): void {
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
  // Pagina gia scorsa (ricarica, ancora #sezione): l'utente e gia dentro.
  if (window.scrollY > 0) engage();
  else
    for (const type of ENGAGE_EVENTS)
      addEventListener(type, engage, { capture: true, passive: true });

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
