import type { SceneTier } from './capabilities';
import type { SceneModule } from './types';

/*
 * Registro delle scene: nome in `data-scene` -> caricatore pigro. Ogni voce DEVE usare `import()`
 * dinamico, cosi three e le scene finiscono in chunk separati e il bootstrap resta piccolo.
 */
export const sceneLoaders = {
  homelab: () => import('./scenes/homelab'),
  domotica: () => import('./scenes/domotica'),
  lavori: () => import('./scenes/lavori'),
  certificazioni: () => import('./scenes/certificazioni'),
} satisfies Record<string, () => Promise<SceneModule>>;

export type SceneName = keyof typeof sceneLoaders;

export const sceneNames = Object.keys(sceneLoaders) as SceneName[];

export function isSceneName(value: string | undefined): value is SceneName {
  return value !== undefined && Object.hasOwn(sceneLoaders, value);
}

/** Stato esposto su `data-scene-state` (utile a CSS e test). */
export type SceneState = 'idle' | 'loading' | 'running' | 'paused' | 'static' | 'text' | 'error';

/** La scena anima solo se e a livello pieno, visibile e con la scheda in primo piano. */
export function shouldAnimate(tier: SceneTier, visible: boolean, documentHidden: boolean): boolean {
  return tier === 'full' && visible && !documentHidden;
}
