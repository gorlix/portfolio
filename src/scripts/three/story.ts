/*
 * Scrollytelling delle sezioni immersive di /human (spec §7.3, PORT-76). Logica PURA, senza DOM:
 * il bootstrap passa le posizioni della prima schermata e delle schede, qui si calcola a che punto
 * del racconto si trova la pagina. Lo scroll resta sempre della pagina: si legge, non si sposta.
 *
 * Posizione del racconto: numero reale tra 0 e (momenti - 1). 0 = prima schermata, 1 = prima scheda
 * al centro del viewport, 1,5 = a meta strada tra la prima e la seconda, e cosi via.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Sotto questa posizione si e ancora nella prima schermata: 3D usabile e comandi visibili. */
export const INTERACTIVE_UNTIL = 0.35;

/**
 * Posizione del racconto dai centri (in coordinate viewport, crescenti nell'ordine di pagina)
 * della prima schermata e delle schede, rispetto alla linea di lettura `focus` (di solito
 * meta viewport). Prima del primo centro 0, dopo l'ultimo l'ultimo indice.
 */
export function storyPosition(anchors: readonly number[], focus: number): number {
  const last = anchors.length - 1;
  if (last < 0) return 0;
  if (focus <= (anchors[0] as number)) return 0;
  for (let i = 0; i < last; i += 1) {
    const from = anchors[i] as number;
    const to = anchors[i + 1] as number;
    if (focus <= to) return to > from ? i + (focus - from) / (to - from) : i + 1;
  }
  return last;
}

/** Curva morbida in ingresso e in uscita: la camera parte e arriva piano. */
export const ease = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export interface Blend {
  /** Momento di partenza e di arrivo (indici); uguali quando si e fermi su un momento. */
  from: number;
  to: number;
  /** Avanzamento gia addolcito tra i due, 0..1. */
  t: number;
}

/**
 * Tra quali momenti si trova la posizione. Il passaggio si concentra al centro del tratto
 * (`hold` per parte resta fermo sul momento), cosi una scheda letta al centro ha la sua
 * inquadratura stabile e la camera si muove nello spazio tra una scheda e l'altra.
 */
export function blendAt(position: number, count: number, hold = 0.2): Blend {
  const last = Math.max(0, count - 1);
  const p = Math.min(last, Math.max(0, position));
  const from = Math.min(Math.floor(p), last);
  const to = Math.min(from + 1, last);
  const raw = p - from;
  const t = from === to ? 0 : ease((raw - hold) / (1 - 2 * hold));
  return { from, to, t };
}

/**
 * Livello di resa statico (reduced-motion, dispositivi deboli): un fotogramma per momento,
 * quello piu vicino, senza interpolazione.
 */
export const snapPosition = (position: number): number => Math.max(0, Math.round(position));

/** La prima schermata e ancora quella attiva (3D usabile, comandi visibili). */
export const isInteractive = (position: number): boolean => position < INTERACTIVE_UNTIL;

/**
 * Opacita dello sfondo della sezione: entra mentre la sezione sale, esce sul finale, quando
 * il fondo della sezione passa sopra la meta bassa del viewport (dissolvenza verso la successiva).
 */
export function stageOpacity(top: number, bottom: number, viewport: number): number {
  if (viewport <= 0) return 1;
  const fadeIn = clamp01((viewport - top) / (viewport * 0.5));
  const fadeOut = clamp01((bottom - viewport * 0.25) / (viewport * 0.75));
  return Math.min(fadeIn, fadeOut);
}
