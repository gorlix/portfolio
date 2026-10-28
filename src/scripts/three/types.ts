import type { SceneTier } from './capabilities';

/** Contratto tra il bootstrap e ogni modulo di scena (caricato sempre con `import()`). */

export interface SceneContext {
  /** Canvas gia inserito nel contenitore. */
  canvas: HTMLCanvasElement;
  /** Contenitore `[data-scene]`: da qui si leggono i token colore con getComputedStyle. */
  container: HTMLElement;
  /** 'full' anima, 'reduced' disegna un solo fotogramma statico. */
  tier: Exclude<SceneTier, 'text'>;
  /** Dati del blocco JSON `[data-scene-data]` del contenitore, se presente (vedi Scene.astro). */
  data?: unknown;
}

export interface SceneInstance {
  /** Avvia il ciclo di animazione (solo 'full'); idempotente. */
  start(): void;
  /** Ferma il ciclo: nessun requestAnimationFrame resta in coda; idempotente. */
  stop(): void;
  /** Ridimensiona alla misura del contenitore e, se ferma, ridisegna un fotogramma. */
  resize(width: number, height: number): void;
  /**
   * Solo micro-scene: avanzamento richiesto dallo scroll, tra 0 e 1. La scena lo raggiunge con
   * una breve rincorsa (solo tra start e stop); a livello 'reduced' resta ferma sulla fine.
   */
  setProgress?(progress: number): void;
  /** Libera geometrie, materiali e renderer. Dopo dispose l'istanza non e piu utilizzabile. */
  dispose(): void;
}

export interface SceneModule {
  mount(context: SceneContext): SceneInstance;
}
