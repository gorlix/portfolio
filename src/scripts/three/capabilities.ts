/*
 * Rilevamento delle capacita per le scene 3D di /human (spec §10, "Fallback 3D").
 * `decideTier` e PURA: riceve un'istantanea dell'ambiente e decide il livello di resa.
 * `probeCapabilities` legge il browser; il controllo WebGL usa un canvas usa-e-getta
 * e non carica mai three.
 */

/** Livello di resa: scena animata, scena statica (un solo fotogramma), solo testo. */
export type SceneTier = 'full' | 'reduced' | 'text';

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
}

/** Soglia (inclusa) sotto cui il dispositivo e considerato debole. */
export const WEAK_DEVICE_MEMORY_GB = 2;
export const WEAK_CORE_COUNT = 2;

const isWeak = (value: number | undefined, limit: number): boolean =>
  typeof value === 'number' && value > 0 && value <= limit;

export function decideTier(input: CapabilityInput): SceneTier {
  // Chi chiede meno movimento o meno dati riceve solo il testo, che contiene gia tutto.
  if (input.reducedMotion || input.saveData) return 'text';
  if (!input.webgl) return 'text';
  if (
    input.majorPerformanceCaveat ||
    isWeak(input.deviceMemory, WEAK_DEVICE_MEMORY_GB) ||
    isWeak(input.hardwareConcurrency, WEAK_CORE_COUNT)
  ) {
    return 'reduced';
  }
  return 'full';
}

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

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function probeCapabilities(): CapabilityInput {
  const nav = navigator as Navigator & NavigatorHints;
  return {
    ...probeWebgl(),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}
