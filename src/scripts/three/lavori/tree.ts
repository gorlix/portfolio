/*
 * Layout dell'albero dei lavori (PORT-81). Logica PURA, senza three: dal lato di ogni foglia
 * (in ordine cronologico, la piu vecchia in basso) calcola altezza del tronco, attacco e punta
 * di ogni ramo, e le inquadrature della camera. La scena (../scenes/lavori.ts) li disegna soltanto.
 */

export type Side = 'left' | 'right';

/** Distanza verticale tra due foglie e margini del tronco (unita di scena). */
export const STEP = 1.15;
export const TRUNK_BASE = 1.1;
export const CROWN = 1.5;
/** Sporgenza orizzontale del ramo e salita dalla biforcazione alla punta. */
export const REACH = 1.2;
export const RISE = 0.5;
/** Lunghezza della foglia, dal picciolo alla punta. */
export const LEAF_LENGTH = 1.05;

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface Branch {
  side: Side;
  /** Dove il ramo si stacca dal tronco e dove porta la foglia. */
  base: Point;
  tip: Point;
}

export interface TreeLayout {
  /** Altezza del tronco. */
  height: number;
  branches: Branch[];
}

/** Albero per N foglie: cresce in altezza, i rami alternano il lato indicato dai dati. */
export function layoutTree(sides: readonly Side[]): TreeLayout {
  const count = Math.max(1, sides.length);
  const branches = sides.map((side, i): Branch => {
    const sign = side === 'right' ? 1 : -1;
    // Un po' di profondita, ripetuta ogni tre rami: l'albero non e piatto come un disegno.
    const depth = ((i % 3) - 1) * 0.35;
    const y = TRUNK_BASE + i * STEP;
    return {
      side,
      base: { x: 0, y, z: 0 },
      tip: { x: sign * (REACH + (i % 2) * 0.2), y: y + RISE, z: depth },
    };
  });
  return { height: TRUNK_BASE + (count - 1) * STEP + CROWN, branches };
}

/** Indice della foglia di un momento (per slug); -1 per prima schermata, uscita e sconosciuti. */
export function leafIndex(moment: string, slugs: readonly string[]): number {
  return slugs.indexOf(moment);
}

/** Distanza della camera perche un riquadro `spanH` x `spanW` (unita) stia nel campo visivo. */
export function fitDistance(spanH: number, spanW: number, aspect: number, fov: number): number {
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return Math.max(spanH / 2 / Math.tan(vertical), spanW / 2 / Math.tan(horizontal));
}

/** Larghezza minima (px) da cui le schede stanno di lato alla foglia (come il CSS: 60rem). */
export const SIDE_BY_SIDE_PX = 960;

export interface Framing {
  /** Spostamento orizzontale del soggetto, in frazioni di meta larghezza (positivo = a destra). */
  shift: number;
  /** Spostamento verticale, in frazioni d'altezza (positivo = sale). */
  lift: number;
}

/**
 * Dove mettere la foglia attiva sullo schermo: su schermo largo dal lato opposto alla scheda
 * (foglia a destra, scheda a destra: l'albero va a sinistra), su schermo stretto nella parte alta,
 * sopra la scheda che occupa il centro.
 */
export function cardFraming(side: Side, widthPx: number): Framing {
  if (widthPx >= SIDE_BY_SIDE_PX) return { shift: side === 'right' ? -0.7 : 0.7, lift: 0 };
  return { shift: 0, lift: 0.26 };
}

/** Scostamento orizzontale del tronco a quota `y`: una leggera curva, non un palo dritto. */
export const trunkOffset = (y: number): number => Math.sin(y * 0.75 + 0.6) * 0.11;
