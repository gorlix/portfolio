import type { RenderProfile, SceneTier } from './capabilities';

/** Contratto tra il bootstrap e ogni modulo di scena (caricato sempre con `import()`). */

export interface SceneContext {
  /** Canvas gia inserito nel contenitore. */
  canvas: HTMLCanvasElement;
  /** Contenitore `[data-scene]`: da qui si leggono i token colore con getComputedStyle. */
  container: HTMLElement;
  /** 'full' anima, 'reduced' disegna un solo fotogramma statico. */
  tier: Exclude<SceneTier, 'text'>;
  /** Dettaglio di resa (pixel ratio massimo, antialias) deciso da `renderProfile`. */
  profile: RenderProfile;
  /** Dati del blocco JSON `[data-scene-data]` del contenitore, se presente (vedi Scene.astro). */
  data?: unknown;
  /** Solo scene immersive: nomi dei momenti nell'ordine di pagina (prima schermata, poi schede). */
  moments?: readonly string[];
}

export interface SceneInstance {
  /** Avvia il ciclo di animazione (solo 'full'); idempotente. */
  start(): void;
  /** Ferma il ciclo: nessun requestAnimationFrame resta in coda; idempotente. */
  stop(): void;
  /** Ridimensiona alla misura del contenitore e, se ferma, ridisegna un fotogramma. */
  resize(width: number, height: number): void;
  /**
   * Solo scene immersive: posizione del racconto (0 = prima schermata, i = scheda i al centro,
   * valori intermedi tra una scheda e l'altra; vedi ../story.ts). A livello 'reduced' arriva gia
   * arrotondata a un momento. Con `interactive` falso la scena ignora i gesti.
   */
  setStory?(position: number, interactive: boolean): void;
  /** Libera geometrie, materiali e renderer. Dopo dispose l'istanza non e piu utilizzabile. */
  dispose(): void;
}

export interface SceneModule {
  mount(context: SceneContext): SceneInstance;
}
