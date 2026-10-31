/*
 * Rilevamento delle capacita per le scene 3D di /human (spec §10, "Fallback 3D").
 * `decideTier` e PURA: riceve un'istantanea dell'ambiente e decide il livello di resa.
 * `probeCapabilities` legge il browser; il controllo WebGL usa un canvas usa-e-getta
 * e non carica mai three.
 */

/** Livello di resa: scena animata, scena statica (un solo fotogramma), solo testo. */
export type SceneTier = 'full' | 'reduced' | 'text';

/**
 * Scena interattiva o scena immersiva (sfondo della sezione guidato dalle schede, PORT-76). Cambia
 * solo la risposta a reduced-motion: l'immersiva resta come fotogramma statico per scheda, che non
 * si muove e illustra lo stesso testo.
 */
export type SceneKind = 'interactive' | 'immersive';

export interface CapabilityInput {
  /** Contesto WebGL ottenibile. */
  webgl: boolean;
  /** WebGL disponibile solo con forte penalita (es. resa software). */
  majorPerformanceCaveat?: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** Risparmio dati attivo (`navigator.connection.saveData`). */
  saveData: boolean;
  /** GB di memoria dichiarati (`navigator.deviceMemory`), se esposti. */
  deviceMemory?: number | undefined;
  /** Core logici (`navigator.hardwareConcurrency`), se esposti. */
  hardwareConcurrency?: number | undefined;
  /** Batteria sotto soglia e non in carica (Battery API, dove esiste). */
  lowBattery?: boolean | undefined;
  /** Puntatore principale impreciso (telefono, tablet): `(pointer: coarse)`. */
  coarsePointer?: boolean | undefined;
}

/** Dettaglio di resa per un livello che disegna qualcosa: pixel ratio massimo e antialias. */
export interface RenderProfile {
  maxPixelRatio: number;
  antialias: boolean;
}

/** Sotto questa carica (0-1), se non in carica, le scene passano al fotogramma statico. */
export const LOW_BATTERY_LEVEL = 0.2;

/** Soglia (inclusa) sotto cui il dispositivo e considerato debole. */
export const WEAK_DEVICE_MEMORY_GB = 2;
export const WEAK_CORE_COUNT = 2;

const isWeak = (value: number | undefined, limit: number): boolean =>
  typeof value === 'number' && value > 0 && value <= limit;

export function decideTier(input: CapabilityInput, kind: SceneKind = 'interactive'): SceneTier {
  // Chi chiede meno dati o non ha WebGL riceve solo il testo, che contiene gia tutto.
  if (input.saveData || !input.webgl) return 'text';
  // Meno movimento: la scena interattiva lascia il posto al testo, le altre restano ferme.
  if (input.reducedMotion) return kind === 'interactive' ? 'text' : 'reduced';
  if (
    input.majorPerformanceCaveat ||
    input.lowBattery === true ||
    isWeak(input.deviceMemory, WEAK_DEVICE_MEMORY_GB) ||
    isWeak(input.hardwareConcurrency, WEAK_CORE_COUNT)
  ) {
    return 'reduced';
  }
  return 'full';
}

/**
 * Dettaglio di resa. Statico: un fotogramma a pixel ratio 1. Animato su schermo tattile
 * (telefono): pixel ratio 1,5 e niente antialias, per tenere gli fps; altrimenti 2 con antialias.
 */
export function renderProfile(
  tier: Exclude<SceneTier, 'text'>,
  input: Pick<CapabilityInput, 'coarsePointer'>,
): RenderProfile {
  if (tier !== 'full') return { maxPixelRatio: 1, antialias: false };
  if (input.coarsePointer === true) return { maxPixelRatio: 1.5, antialias: false };
  return { maxPixelRatio: 2, antialias: true };
}

/** Pixel ratio da dare al renderer: quello dello schermo, limitato dal profilo. */
export const pixelRatioFor = (profile: RenderProfile, devicePixelRatio: number): number =>
  Math.min(devicePixelRatio, profile.maxPixelRatio);

/** Libera subito il contesto di prova, per non occupare uno dei pochi slot WebGL del browser. */
const release = (gl: WebGLRenderingContext | WebGL2RenderingContext): void => {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};

type ProbeContext = WebGLRenderingContext | WebGL2RenderingContext | null;

const tryContext = (attributes: WebGLContextAttributes): ProbeContext => {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2', attributes) ??
      canvas.getContext('webgl', attributes)) as ProbeContext;
  } catch {
    return null;
  }
};

/** Prova WebGL su un canvas staccato dal documento. Nessuna dipendenza da three. */
export function probeWebgl(): { webgl: boolean; majorPerformanceCaveat: boolean } {
  const fast = tryContext({ failIfMajorPerformanceCaveat: true });
  if (fast) {
    release(fast);
    return { webgl: true, majorPerformanceCaveat: false };
  }
  const any = tryContext({});
  if (any) {
    release(any);
    return { webgl: true, majorPerformanceCaveat: true };
  }
  return { webgl: false, majorPerformanceCaveat: false };
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<BatteryLike>;
}

let batteryLow = false;
let watchingBattery = false;

/** Stato batteria letto finora (la Battery API e asincrona e assente su Safari/Firefox). */
export const isBatteryLow = (): boolean => batteryLow;

/** Avvia una volta sola l'ascolto della batteria; senza API resta `false`. */
function watchBattery(nav: Navigator & NavigatorHints): void {
  if (watchingBattery || typeof nav.getBattery !== 'function') return;
  watchingBattery = true;
  nav
    .getBattery()
    .then((battery) => {
      const update = (): void => {
        batteryLow = !battery.charging && battery.level <= LOW_BATTERY_LEVEL;
      };
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    })
    .catch(() => {
      // Permesso negato o API bloccata: come se non esistesse.
    });
}

export function probeCapabilities(): CapabilityInput {
  const nav = navigator as Navigator & NavigatorHints;
  watchBattery(nav);
  return {
    ...probeWebgl(),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    lowBattery: batteryLow,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
  };
}
