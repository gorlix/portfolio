import { STRIDE } from '../lavori/course';

/*
 * Citta dei repository (PORT-89). Logica PURA, senza three: dai gruppi costruisce un viale dritto
 * lungo X con un quartiere per gruppo e un edificio per repository, piu alto se ha piu stelle, e
 * dice dove sta il pinguino per ogni posizione del racconto. Nessun salto: cammina sempre a terra,
 * fermo a ogni momento, e alla fine saluta.
 *
 * Gli edifici stanno solo dietro al viale (Z negativo), su due file sfalsate: la fila dietro
 * prende i piu alti, cosi nessuno ne copre un altro e il pinguino davanti resta in vista.
 */

export interface DistrictInput {
  id: string;
  /** Stelle di ogni repository del gruppo, nell'ordine dei dati. */
  stars: number[];
}

export interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Quartiere (indice) e repository nel gruppo (indice nei dati). */
  district: number;
  repo: number;
  /** Forma, deterministica: 0 torre, 1 a gradoni, 2 con la cima piu stretta. */
  style: 0 | 1 | 2;
}

export interface Block {
  x0: number;
  x1: number;
}

export interface City {
  blocks: Block[];
  buildings: Building[];
  /** Dove sta il pinguino a ogni momento: partenza, un quartiere per gruppo, arrivo. */
  stops: number[];
  length: number;
}

export type WalkerPose = 'stand' | 'run' | 'wave';

export interface Walker {
  x: number;
  pose: WalkerPose;
  phase: number;
}

/** Altezza senza stelle, altezza massima e crescita per raddoppio delle stelle (unita). */
export const HEIGHT = { base: 1, max: 6.4, perDoubling: 0.62 };
/** Passo tra gli edifici di una fila, margine del quartiere, varco tra due quartieri. */
export const COLUMN = 1.9;
export const MARGIN = 1.1;
export const CROSSING = 1.4;
/** Dimensioni di un edificio e file: la seconda e piu lontana e sfalsata di mezzo passo. */
export const PLOT = { width: 1.3, depth: 1.1 };
export const ROWS = { front: -2.1, back: -3.7 };
/** Punto del quartiere dove il pinguino si ferma, a partire dal bordo. */
const STOP_AT = 0.7;
/** Tratto fermo attorno a ogni momento, per parte; quota dell'ultimo tratto dedicata al saluto. */
const HOLD = 0.15;
const WAVE_SHARE = 0.3;

/** Scala logaritmica: i progetti piccoli restano leggibili accanto a quelli da migliaia di stelle. */
export const buildingHeight = (stars: number): number =>
  Math.min(HEIGHT.max, HEIGHT.base + HEIGHT.perDoubling * Math.log2(1 + Math.max(0, stars)));

/** Costruisce quartieri, edifici e soste del pinguino. */
export function buildCity(districts: readonly DistrictInput[]): City {
  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const stops = [0];
  let x = 1.5;
  districts.forEach((district, d) => {
    // I piu stellati in fondo: la fila dietro spunta sopra quella davanti.
    const order = district.stars
      .map((stars, repo) => ({ stars, repo }))
      .sort((a, b) => b.stars - a.stars || a.repo - b.repo);
    const backCount = Math.ceil(order.length / 2);
    const columns = Math.max(1, backCount);
    const length = MARGIN * 2 + columns * COLUMN;
    order.forEach(({ stars, repo }, i) => {
      const back = i < backCount;
      const column = back ? i : i - backCount;
      buildings.push({
        x: x + MARGIN + (column + (back ? 0.5 : 0.75)) * COLUMN,
        z: back ? ROWS.back : ROWS.front,
        width: PLOT.width,
        depth: PLOT.depth,
        height: buildingHeight(stars),
        district: d,
        repo,
        style: ((d + repo) % 3) as Building['style'],
      });
    });
    blocks.push({ x0: x, x1: x + length });
    stops.push(x + STOP_AT);
    x += length + CROSSING;
  });
  stops.push(x + 0.4);
  return { blocks, buildings, stops, length: x + 3 };
}

/** Dove sta il pinguino e in che posa alla posizione del racconto `story`. */
export function walkerAt(city: City, story: number): Walker {
  const { stops } = city;
  const last = stops.length - 1;
  const s = Math.min(last, Math.max(0, story));
  const from = Math.min(Math.floor(s), Math.max(0, last - 1));
  const a = stops[from] ?? 0;
  const b = stops[from + 1] ?? a;
  const final = from === last - 1;
  const u = Math.min(1, Math.max(0, (s - from - HOLD) / (1 - 2 * HOLD)));
  // Ultimo tratto: arriva prima della fine, poi saluta sul posto.
  const walk = final ? Math.min(1, u / (1 - WAVE_SHARE)) : u;
  const x = a + (b - a) * walk;
  if (final && u > 1 - WAVE_SHARE) {
    return { x, pose: 'wave', phase: ((u - (1 - WAVE_SHARE)) / WAVE_SHARE) * 3 };
  }
  if (walk <= 0 || walk >= 1) return { x, pose: 'stand', phase: 0 };
  return { x, pose: 'run', phase: x / STRIDE };
}
