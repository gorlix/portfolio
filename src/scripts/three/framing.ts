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
