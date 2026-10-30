import { blendAt } from './story';

/*
 * Inquadrature condivise dalle scene immersive guidate dalle schede. Logica pura, senza three.
 */

/** Distanza della camera perche un riquadro `spanH` x `spanW` (unita) stia nel campo visivo. */
export function fitDistance(spanH: number, spanW: number, aspect: number, fov: number): number {
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return Math.max(spanH / 2 / Math.tan(vertical), spanW / 2 / Math.tan(horizontal));
}

/** Larghezza minima (px) da cui le schede stanno di lato alla scena (come il CSS: 60rem). */
export const SIDE_BY_SIDE_PX = 960;

export interface Framing {
  /** Spostamento orizzontale del soggetto, in frazioni di meta larghezza (positivo = a destra). */
  shift: number;
  /** Spostamento verticale, in frazioni d'altezza (positivo = sale). */
  lift: number;
}

/**
 * Dove tenere il soggetto sullo schermo durante le schede. Su schermo largo le schede stanno
 * tutte a sinistra e il soggetto a destra: l'occhio non deve rimbalzare da un lato all'altro.
 * Su schermo stretto il soggetto sta nella parte alta, sopra la scheda.
 */
export function cardFraming(widthPx: number): Framing {
  if (widthPx >= SIDE_BY_SIDE_PX) return { shift: 0.45, lift: 0 };
  return { shift: 0, lift: 0.33 };
}

export type Vec = readonly [number, number, number];

export interface Shot {
  /** Punto guardato. */
  target: Vec;
  /** Direzione dal punto alla camera (non serve normalizzarla). */
  from: Vec;
  /** Altezza e larghezza da tenere in vista (unita). */
  spanH: number;
  spanW: number;
}

/** Lunghezza di un vettore. */
export const norm = ([x, y, z]: Vec): number => Math.hypot(x, y, z);

/** Posizione della camera di un'inquadratura alla distanza data. */
export function eyeOf({ target, from }: Shot, distance: number): Vec {
  const k = distance / norm(from);
  return [target[0] + from[0] * k, target[1] + from[1] * k, target[2] + from[2] * k];
}

/** Occhio e punto guardato alla posizione del racconto: fermi sulla scheda, morbidi tra due. */
export function cameraAt(
  shots: readonly Shot[],
  distances: readonly number[],
  story: number,
): { eye: Vec; target: Vec; from: number; to: number; t: number } {
  const { from, to, t } = blendAt(story, shots.length);
  const a = shots[from] as Shot;
  const b = shots[to] as Shot;
  const eyeA = eyeOf(a, distances[from] as number);
  const eyeB = eyeOf(b, distances[to] as number);
  const mixVec = (u: Vec, v: Vec): Vec => [
    u[0] + (v[0] - u[0]) * t,
    u[1] + (v[1] - u[1]) * t,
    u[2] + (v[2] - u[2]) * t,
  ];
  return { eye: mixVec(eyeA, eyeB), target: mixVec(a.target, b.target), from, to, t };
}
