/*
 * Avanzamento delle micro-scene in funzione dello scroll (spec §7.3). Logica PURA, senza DOM:
 * il bootstrap passa le misure del riquadro e del viewport. Lo scroll resta sempre della pagina:
 * qui si legge soltanto dove si trova il riquadro, non si sposta mai niente.
 */

export interface Box {
  /** Distanza del bordo superiore dal bordo superiore del viewport (getBoundingClientRect). */
  top: number;
  height: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * 0 quando il riquadro affiora dal fondo del viewport, 1 quando il suo centro arriva al centro.
 * La scena si completa quindi in poco piu di mezzo schermo di scroll ("pochi secondi"), e
 * tornando indietro si riavvolge.
 */
export function scrollProgress({ top, height }: Box, viewport: number): number {
  const span = (viewport + height) / 2;
  if (span <= 0) return 1;
  return clamp01((viewport - top) / span);
}

/** Il riquadro interseca il viewport. */
export function isOnScreen({ top, height }: Box, viewport: number): boolean {
  return top < viewport && top + height > 0;
}

/**
 * Una sola micro-scena attiva per volta: tra quelle a schermo, quella col centro piu vicino al
 * centro del viewport. -1 se nessuna e a schermo.
 */
export function pickActive(boxes: readonly Box[], viewport: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  boxes.forEach((box, i) => {
    if (!isOnScreen(box, viewport)) return;
    const distance = Math.abs(box.top + box.height / 2 - viewport / 2);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}
