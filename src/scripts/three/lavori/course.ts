import type { Scenery } from '../../../lib/schemas/experiences';
import type { Level } from '../../../lib/work';

/*
 * Percorso dei Lavori (PORT-83). Logica PURA, senza three: dai livelli (uno per esperienza,
 * nell'ordine delle schede) costruisce una strada piana, una striscia per livello, con la
 * scenografia del livello a lato, e la passeggiata del pinguino; `runnerAt` dice dov'e il
 * pinguino e in che posa per ogni posizione del racconto. Nessun input di gioco: la posizione e
 * una funzione pura dello scroll, avanti e indietro.
 *
 * Il pinguino cammina sempre a terra (y = 0); l'unico salto e un saltello basso nel varco tra un
 * livello e l'altro, a meta strada tra due schede. A ogni momento e fermo accanto alla scenografia
 * del suo livello.
 */

export interface Strip {
  x0: number;
  x1: number;
  /** Livello (indice nei dati) o -1 per partenza e arrivo. */
  level: number;
}

export interface Prop {
  kind: Scenery | 'goal';
  /** Centro dell'oggetto lungo la strada. */
  x: number;
  level: number;
}

export type MoveKind = 'walk' | 'hop' | 'wave';

export interface Move {
  kind: MoveKind;
  x0: number;
  x1: number;
  beats: number;
  level: number;
}

export interface Course {
  strips: Strip[];
  props: Prop[];
  moves: Move[];
  /** Battute (cumulate) di ogni momento: prima schermata, un livello per scheda, uscita. */
  anchors: number[];
  /** Estremi in X di ogni livello. */
  spans: { x0: number; x1: number }[];
  length: number;
}

export type RunnerPose = 'stand' | 'run' | 'jump' | 'wave';

export interface Runner {
  x: number;
  y: number;
  pose: RunnerPose;
  /** Fase della posa: ciclo del passo (camminata), 0..1 del saltello, ciclo del saluto. */
  phase: number;
  /** Livello attraversato, -1 alla partenza e all'arrivo. */
  level: number;
}

/** Spazio occupato da un oggetto di scena e margine ai bordi del livello (unita). */
export const PROP_SPACING = 2.4;
export const LEVEL_MARGIN = 1.6;
/** Varco tra due livelli, superato con un saltello, e altezza del saltello. */
export const GAP = 0.6;
export const HOP_HEIGHT = 0.3;
/** Lunghezza di un passo: la fase della camminata dipende dallo spazio, non dal tempo. */
export const STRIDE = 0.45;
/** Battute per unita di cammino; durata di saltello e saluto. */
const PACE = { walk: 0.3, hop: 0.5, wave: 1.6 };
/** Tratto fermo attorno a ogni momento, per parte: la scheda letta al centro ha il pinguino fermo. */
export const HOLD = 0.15;
const EPS = 1e-9;

/** Costruisce strada, scenografia e passeggiata dai livelli. */
export function buildCourse(levels: readonly Pick<Level, 'scenery'>[]): Course {
  const strips: Strip[] = [];
  const props: Prop[] = [];
  const moves: Move[] = [];
  const anchors = [0];
  const spans: { x0: number; x1: number }[] = [];
  let x = 0;
  let beats = 0;
  let edge = 0;

  const move = (kind: MoveKind, to: number, level: number): void => {
    const length = kind === 'walk' ? Math.abs(to - x) * PACE.walk : PACE[kind];
    moves.push({ kind, x0: x, x1: to, beats: length, level });
    beats += length;
    x = to;
  };
  /** Cammina fino al bordo del piano, saltella oltre il varco e atterra sul livello seguente. */
  const cross = (level: number): number => {
    move('walk', edge - 0.3, level);
    const start = edge + GAP;
    move('hop', start + 0.3, level);
    return start;
  };

  // Partenza: un tratto di strada con il pinguino fermo.
  strips.push({ x0: -3, x1: 1, level: -1 });
  edge = 1;
  levels.forEach((data, i) => {
    const start = cross(i);
    const items = data.scenery;
    const length = LEVEL_MARGIN * 2 + Math.max(1, items.length) * PROP_SPACING;
    strips.push({ x0: start, x1: start + length, level: i });
    items.forEach((kind, k) => {
      props.push({ kind, x: start + LEVEL_MARGIN + (k + 0.5) * PROP_SPACING, level: i });
    });
    // Momento del livello: fermo poco prima della prima scenografia, che resta in vista davanti
    // a lui; poi prosegue fino al bordo.
    move('walk', start + LEVEL_MARGIN - 0.2, i);
    anchors.push(beats);
    edge = start + length;
    spans.push({ x0: start, x1: edge });
  });
  // Arrivo: ultimo varco, un tratto con la meta, il pinguino si ferma e saluta.
  const goal = cross(-1);
  strips.push({ x0: goal, x1: goal + 4.5, level: -1 });
  props.push({ kind: 'goal', x: goal + 3, level: -1 });
  move('walk', goal + 1.7, -1);
  move('wave', goal + 1.7, -1);
  anchors.push(beats);

  return { strips, props, moves, anchors, spans, length: goal + 4.5 };
}

/** Battuta della posizione del racconto: lineare tra due momenti, ferma attorno a ciascuno. */
export function beatAt(course: Course, story: number): number {
  const { anchors } = course;
  const last = anchors.length - 1;
  const s = Math.min(last, Math.max(0, story));
  const from = Math.min(Math.floor(s), Math.max(0, last - 1));
  const u = Math.min(1, Math.max(0, (s - from - HOLD) / (1 - 2 * HOLD)));
  const a = anchors[from] ?? 0;
  const b = anchors[from + 1] ?? a;
  return a + (b - a) * u;
}

/** Dove sta il pinguino e in che posa alla posizione del racconto `story`. */
export function runnerAt(course: Course, story: number): Runner {
  let beat = beatAt(course, story);
  for (const m of course.moves) {
    // Tolleranza: le battute cumulate e i momenti sono somme in virgola mobile.
    if (beat > m.beats + EPS) {
      beat -= m.beats;
      continue;
    }
    const raw = m.beats > 0 ? Math.min(1, beat / m.beats) : 1;
    const t = raw < EPS ? 0 : raw > 1 - EPS ? 1 : raw;
    const x = m.x0 + (m.x1 - m.x0) * t;
    if (m.kind === 'wave') return { x, y: 0, pose: 'wave', phase: t * 3, level: m.level };
    // Ai bordi della mossa il pinguino e fermo: e il fotogramma di ogni momento.
    if (t <= 0 || t >= 1) return { x, y: 0, pose: 'stand', phase: 0, level: m.level };
    if (m.kind === 'hop') {
      return { x, y: 4 * HOP_HEIGHT * t * (1 - t), pose: 'jump', phase: t, level: m.level };
    }
    return { x, y: 0, pose: 'run', phase: x / STRIDE, level: m.level };
  }
  const end = course.moves.at(-1);
  return { x: end?.x1 ?? 0, y: 0, pose: end ? 'wave' : 'stand', phase: 3, level: -1 };
}

/** Distanza della camera perche un riquadro `spanH` x `spanW` (unita) stia nel campo visivo. */
export function fitDistance(spanH: number, spanW: number, aspect: number, fov: number): number {
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return Math.max(spanH / 2 / Math.tan(vertical), spanW / 2 / Math.tan(horizontal));
}

/** Larghezza minima (px) da cui le schede stanno di lato al percorso (come il CSS: 60rem). */
export const SIDE_BY_SIDE_PX = 960;

export interface Framing {
  /** Spostamento orizzontale del pinguino, in frazioni di meta larghezza (positivo = a destra). */
  shift: number;
  /** Spostamento verticale, in frazioni d'altezza (positivo = sale). */
  lift: number;
}

/**
 * Dove tenere il pinguino sullo schermo durante le schede. Su schermo largo le schede stanno
 * tutte a sinistra e il pinguino a destra: l'occhio non deve rimbalzare da un lato all'altro.
 * Su schermo stretto la strada sta nella parte alta, sopra la scheda.
 */
export function cardFraming(widthPx: number): Framing {
  if (widthPx >= SIDE_BY_SIDE_PX) return { shift: 0.45, lift: 0 };
  return { shift: 0, lift: 0.33 };
}
