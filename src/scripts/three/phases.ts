/*
 * Funzioni pure per scandire le micro-scene in fasi lungo l'avanzamento 0..1 (spec §13).
 * Nessuna dipendenza da three: testabili da sole.
 */

/** Avanzamento locale di una fase che occupa [from, to] dell'avanzamento totale (limitato a 0..1). */
export const phase = (progress: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (progress - from) / (to - from)));

/**
 * Comparsa in sequenza di `count` elementi nella parte iniziale `span` dell'avanzamento: ognuno
 * ha una finestra che si sovrappone appena alla successiva. Con progress=1 sono tutti a 1.
 */
export function staggered(progress: number, index: number, count: number, span = 1): number {
  // L'ultima finestra finisce esattamente a `span`: la fine e sempre il fotogramma completo.
  const slot = span / (Math.max(1, count) + 0.4);
  const start = index * slot;
  return phase(progress, start, start + slot * 1.4);
}
