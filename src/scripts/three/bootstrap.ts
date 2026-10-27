import { decideTier, probeCapabilities, type SceneTier } from './capabilities';
import { isSceneName, type SceneState, sceneLoaders, shouldAnimate } from './registry';
import type { SceneInstance } from './types';

/*
 * Caricamento pigro delle scene 3D di /human (spec §3.5 e §10). Incluso solo da Scene.astro.
 * Nessun import statico di three: ogni scena arriva con `import()` quando la sua sezione si avvicina.
 * Il testo della sezione e gia nell'HTML: se qualcosa manca o fallisce, resta quello.
 */

/** Margine di anticipo: si carica quando la sezione e a circa uno schermo di distanza. */
const NEAR_MARGIN = '100% 0px 100% 0px';

let tier: SceneTier | undefined;
/** Le capacita si misurano una volta sola, al primo avvicinamento di una scena. */
const currentTier = (): SceneTier => {
  tier ??= decideTier(probeCapabilities());
  return tier;
};

const setState = (el: HTMLElement, state: SceneState): void => {
  el.dataset.sceneState = state;
};

/** Il riquadro sparisce: resta solo il testo della sezione. */
const toText = (el: HTMLElement): void => {
  setState(el, 'text');
  el.hidden = true;
};

const mounted = new Set<() => void>();

/** Blocco JSON della scena: gli stessi dati dell'equivalente testuale. */
const readData = (el: HTMLElement): unknown => {
  const block = el.querySelector('script[data-scene-data]');
  return block?.textContent ? JSON.parse(block.textContent) : undefined;
};

async function mountScene(el: HTMLElement): Promise<void> {
  const level = currentTier();
  const name = el.dataset.scene;
  if (level === 'text' || !isSceneName(name)) {
    toText(el);
    return;
  }

  setState(el, 'loading');
  let instance: SceneInstance;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  try {
    const module = await sceneLoaders[name]();
    // Nel frattempo l'utente puo aver chiesto meno movimento.
    if (currentTier() === 'text') {
      toText(el);
      return;
    }
    el.append(canvas);
    instance = module.mount({ canvas, container: el, tier: level, data: readData(el) });
  } catch {
    canvas.remove();
    setState(el, 'error');
    toText(el);
    return;
  }

  let visible = false;
  const update = (): void => {
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

  const dispose = (): void => {
    view.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    instance.dispose();
    canvas.remove();
    mounted.delete(dispose);
  };
  // Contesto perso (GPU reimpostata, troppe pagine 3D): si torna al testo, senza riprovare.
  const onContextLost = (): void => {
    dispose();
    toText(el);
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  mounted.add(dispose);
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
  for (const el of containers) {
    setState(el, 'idle');
    near.observe(el);
  }

  // Se l'utente chiede meno movimento a pagina aperta, le scene si chiudono e resta il testo.
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
    if (!event.matches) return;
    tier = 'text';
    for (const dispose of [...mounted]) dispose();
    for (const el of containers) toText(el);
    near.disconnect();
  });

  // Uscita vera dalla pagina (non bfcache): si libera tutto.
  addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    for (const dispose of [...mounted]) dispose();
  });
}

init();
