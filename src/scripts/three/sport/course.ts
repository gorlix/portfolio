export { cameraAt, eyeOf, norm, type Shot, type Vec } from '../framing';

/*
 * Racconto della montagna di Sport (PORT-88). Logica PURA, senza three: ordine dei momenti,
 * percorsi, cicli d'ambiente (sciatore, palle) e inquadrature. Le animazioni d'ambiente dipendono
 * solo dal tempo, i due escursionisti solo dallo scroll: fermo lo scroll, stanno fermi.
 */

/** Slug dei topic `sport` nell'ordine delle schede: ogni voce e un momento della scena. */
export const sportOrder = ['ski', 'hiking', 'tennis', 'volleyball'] as const;

export interface Point {
  x: number;
  z: number;
}

export interface Track {
  points: readonly Point[];
  /** Distanza cumulata di ogni punto dal primo. */
  lengths: number[];
  total: number;
}

export const track = (points: readonly Point[]): Track => {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    lengths.push((lengths[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, lengths, total: lengths.at(-1) ?? 0 };
};

export interface TrackPoint extends Point {
  /** Rotazione Y che porta il fronte del pinguino (+Z) nel verso del percorso. */
  heading: number;
}

/** Punto del percorso a `t` (0..1 della lunghezza), fuori intervallo resta agli estremi. */
export function trackAt({ points, lengths, total }: Track, t: number): TrackPoint {
  const at = Math.min(1, Math.max(0, t)) * total;
  let i = 1;
  while (i < points.length - 1 && (lengths[i] as number) < at) i += 1;
  const a = points[i - 1] as Point;
  const b = points[i] as Point;
  const from = lengths[i - 1] as number;
  const to = lengths[i] as number;
  const k = to > from ? (at - from) / (to - from) : 0;
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

/** Striscia larga `width`, alzata di `lift` sul terreno: due triangoli per ogni tratto. */
export function ribbon(
  points: readonly Point[],
  width: number,
  lift: number,
  heightAt: (x: number, z: number) => number,
): Float32Array {
  const edge = (i: number, side: number): [number, number, number] => {
    const p = points[i] as Point;
    const a = points[Math.max(0, i - 1)] as Point;
    const b = points[Math.min(points.length - 1, i + 1)] as Point;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const x = p.x + ((side * (b.z - a.z)) / len) * (width / 2);
    const z = p.z - ((side * (b.x - a.x)) / len) * (width / 2);
    return [x, heightAt(x, z) + lift, z];
  };
  const out = new Float32Array((points.length - 1) * 18);
  for (let i = 0; i < points.length - 1; i += 1) {
    const l0 = edge(i, -1);
    const r0 = edge(i, 1);
    const l1 = edge(i + 1, -1);
    const r1 = edge(i + 1, 1);
    out.set([...l0, ...l1, ...r0, ...r0, ...l1, ...r1], i * 18);
  }
  return out;
}

// --- Cicli d'ambiente ------------------------------------------------------------------------

/** Durata di una discesa completa (s), tiro di tennis e palleggio di pallavolo (s). */
export const SKI_PERIOD = 24;
export const TENNIS_SHOT = 1.6;
export const VOLLEY_SHOT = 2.4;
/** Tempo del fotogramma fermo: sciatore a meta pista, palle in volo. */
export const STILL_TIME = 13.2;
/** Parte del ciclo in cui lo sciatore scende; nel resto la traccia si scioglie dall'alto. */
const RUN = 0.86;

export interface Descent {
  /** 0..1 lungo la pista. */
  run: number;
  /** Parte di traccia gia sciolta, 0..1 dall'alto. */
  melted: number;
}

export function descentAt(time: number): Descent {
  const u = (time / SKI_PERIOD) % 1;
  return { run: Math.min(1, u / RUN), melted: Math.max(0, (u - RUN) / (1 - RUN)) };
}

export interface Rally {
  /** Da -1 a 1 lungo il campo: la palla va dal giocatore 0 al giocatore 1 e torna. */
  along: number;
  /** Avanzamento del tiro in corso, 0..1. */
  shot: number;
  /** Gesto dei due giocatori, 0 a riposo, 1 al contatto con la palla. */
  swing: [number, number];
}

/** Scambio tra due giocatori: un tiro ogni `period` secondi, sempre uguale. */
export function rallyAt(time: number, period: number): Rally {
  const p = (time / period) % 2;
  const forward = p < 1;
  const shot = forward ? p : p - 1;
  const gesture = (distance: number) => Math.max(0, 1 - distance / 0.22) ** 2;
  return {
    along: forward ? shot * 2 - 1 : 1 - shot * 2,
    shot,
    swing: [gesture(Math.min(p, 2 - p)), gesture(Math.abs(p - 1))],
  };
}

/** Quota della pallina di tennis: arco fino al rimbalzo al 70% del tiro, poi rialza. */
export function tennisBallY(shot: number, contact: number): number {
  if (shot < 0.7) {
    const u = shot / 0.7;
    return contact * (1 - u) + 1.5 * Math.sin(Math.PI * u) + 0.06;
  }
  const v = (shot - 0.7) / 0.3;
  return contact * v + 0.5 * Math.sin(Math.PI * v) + 0.06;
}

/** Quota del pallone: arco alto sopra la rete, dal bagher dell'uno a quello dell'altro. */
export const volleyBallY = (shot: number, contact: number, peak: number): number =>
  contact + (peak - contact) * Math.sin(Math.PI * shot);

// --- Escursionisti ---------------------------------------------------------------------------

/**
 * Avanzamento lungo il sentiero dalla posizione del racconto: 0 fino alla scheda prima, 0,5 a
 * scheda centrata, 1 alla scheda dopo. Funzione pura dello scroll, avanti e indietro.
 */
export const climbAt = (story: number, moment: number): number =>
  Math.min(1, Math.max(0, (story - (moment - 1)) / 2));
