import type { Shot } from '../framing';
import { blendAt, ease } from '../story';

/*
 * Banco degli Interessi (PORT-92): dove stanno gli oggetti, dove cammina il pinguino, le
 * inquadrature di ogni momento. Logica pura, senza three: tutto dipende solo dallo scroll.
 */

/** Argomenti nell'ordine del racconto, da sinistra a destra sul banco: ognuno e un momento. */
export const interessiOrder = [
  '3d-printing',
  'zsa-moonlander',
  'supernote',
  'obsidian',
  'rust',
  'food',
] as const;

export type InteressiSlug = (typeof interessiOrder)[number];

/** Distanza tra due oggetti e linea su cui cammina il pinguino, davanti ai tappetini. */
const SPACING = 18;
export const WALK_Z = 3.1;
/** Il pinguino si ferma un po' prima dell'oggetto: lo guarda senza coprirlo. */
const STOP_OFFSET = 3.6;
/** Partenza e arrivo oltre il primo e l'ultimo oggetto. */
const START_OFFSET = 5;
const FINISH_OFFSET = 7.5;

/** Centro dell'oggetto numero `index` lungo il banco. */
export const stationX = (index: number): number =>
  (index - (interessiOrder.length - 1) / 2) * SPACING;

const LAST_X = stationX(interessiOrder.length - 1);

/** Dove sta il pinguino al momento `name`. */
export function stopOf(name: string): number {
  if (name === 'exit') return LAST_X + FINISH_OFFSET;
  const index = (interessiOrder as readonly string[]).indexOf(name);
  return index < 0 ? stationX(0) - START_OFFSET : stationX(index) - STOP_OFFSET;
}

export interface Walk {
  x: number;
  /** Vero solo tra due momenti: alle schede il pinguino e fermo. */
  between: boolean;
}

/** Posizione del pinguino: stessi tempi della camera, fermo a ogni scheda. */
export function walkAt(names: readonly string[], story: number): Walk {
  const { from, to, t } = blendAt(story, names.length);
  const a = stopOf(names[from] ?? 'overview');
  const b = stopOf(names[to] ?? 'overview');
  return { x: a + (b - a) * t, between: t > 0 && t < 1 };
}

/**
 * Avanzamento di un gesto legato al momento `moment` (pezzo stampato, righe, cupola): vale `start`
 * fino alla scheda prima e 1 sulla sua scheda, cosi a scroll fermo sulla scheda il gesto e finito.
 */
export function revealAt(story: number, moment: number, start = 0): number {
  return start + (1 - start) * ease((story - (moment - 1) - 0.2) / 0.6);
}

/** Inquadrature: `portrait` per gli schermi stretti. */
export function shotsFor(portrait: boolean): Record<string, Shot> {
  const table: Record<string, Shot> = {};
  // Schermo stretto: strette e dall'alto, il piano del banco riempie anche il fondo. Il punto
  // guardato sta dietro l'oggetto: sotto il titolo e sopra la scheda, mai coperto.
  if (portrait) {
    table.overview = { target: [-26, 11, 2], from: [-1, 0.55, 0.22], spanH: 60, spanW: 15 };
    interessiOrder.forEach((slug, i) => {
      const x = stationX(i) + (slug === 'food' ? 0.5 : -1);
      // La scheda del tablet e la piu alta: oggetto un po' piu piccolo, pinguino sempre in vista.
      const tall = slug === 'supernote';
      table[slug] = {
        target: [x, 1, tall ? -2 : -2.8],
        from: [-0.12, 1, 0.6],
        spanH: 12,
        spanW: tall ? 20 : 17,
      };
    });
    table.exit = { target: [LAST_X + 5, 1, 0], from: [-0.2, 0.75, 1], spanH: 12, spanW: 15 };
    return table;
  }
  // Anche su schermo largo la vista d'insieme guarda lungo il banco: niente fascia vuota.
  table.overview = { target: [-20, 2, 1], from: [-1, 0.4, 0.7], spanH: 32, spanW: 66 };
  interessiOrder.forEach((slug, i) => {
    const x = stationX(i) + (slug === 'food' ? 0.4 : -1.4);
    // Bassa, cosi dietro l'oggetto si vede il cielo; la tastiera e piatta e chiede piu altezza.
    const rise = slug === 'zsa-moonlander' ? 0.42 : 0.26;
    table[slug] = { target: [x, 4, 0.6], from: [-0.1, rise, 1], spanH: 13, spanW: 20 };
  });
  table.exit = { target: [LAST_X + 3, 2.5, 1], from: [-0.15, 0.24, 1], spanH: 13, spanW: 27 };
  return table;
}
