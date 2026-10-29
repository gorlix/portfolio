import type { Obstacle } from '../../../lib/schemas/experiences';
import type { Level } from '../../../lib/work';

/*
 * Percorso a piattaforme dei Lavori (PORT-83). Logica PURA, senza three: dai livelli (uno per
 * esperienza, nell'ordine delle schede) costruisce i blocchi da disegnare e la corsa del pinguino,
 * poi `runnerAt` dice dov'e il pinguino e in che posa per ogni posizione del racconto. Nessun
 * input di gioco: la posizione e una funzione pura dello scroll, avanti e indietro.
 *
 * Il percorso corre lungo +X, con il terreno a y = 0. Ogni passaggio tra due blocchi e una mossa
 * (corsa, salto, nastro, saluto) che parte e arriva con i piedi a terra; il tempo e misurato in
 * battute, cosi un salto dura uguale a prescindere dalla distanza.
 */

export type BlockKind =
  | 'ground'
  | 'step'
  | 'crate'
  | 'wall'
  | 'belt'
  | 'pole'
  | 'site'
  | 'bridge'
  | 'garden'
  | 'goal';

export interface Block {
  kind: BlockKind;
  /** Estremi in X e quota del piano d'appoggio (la base e sempre a terra, tranne il ponte). */
  x0: number;
  x1: number;
  top: number;
  /** Livello (indice nei dati) o -1 per partenza e arrivo. */
  level: number;
}

export type MoveKind = 'run' | 'walk' | 'jump' | 'ride' | 'wave';

export interface Move {
  kind: MoveKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Salto: quota massima dei piedi. Ponte: avvallamento al centro. */
  peak: number;
  sag: number;
  beats: number;
  level: number;
}

export interface Course {
  blocks: Block[];
  moves: Move[];
  /** Battute (cumulate) di ogni momento: prima schermata, un livello per scheda, uscita. */
  anchors: number[];
  /** Estremi in X di ogni livello (per l'inquadratura) e dell'intero percorso. */
  spans: { x0: number; x1: number }[];
  length: number;
}

export type RunnerPose = 'stand' | 'run' | 'jump' | 'ride' | 'wave';

export interface Runner {
  x: number;
  y: number;
  pose: RunnerPose;
  /** Fase della posa: ciclo del passo (corsa), 0..1 del salto, ciclo del saluto. */
  phase: number;
  /** Livello attraversato, -1 alla partenza e all'arrivo. */
  level: number;
  /** Avanzamento sul nastro, per farlo scorrere sotto i piedi (0 fuori dal nastro). */
  belt: number;
}

/** Battute per unita di corsa, di camminata (giardino) e sul nastro; durata di salto e saluto. */
const PACE = { run: 0.32, walk: 0.55, ride: 0.42, jump: 0.75, wave: 1.6 };
/** Lunghezza di un passo: la fase della corsa dipende dallo spazio, non dal tempo. */
export const STRIDE = 0.55;
/** Varco tra un livello e il successivo, saltato. */
export const GAP = 1.3;
export const SITE_HEIGHT = 0.7;
/** Tratto fermo attorno a ogni momento, per parte: la scheda letta al centro ha il pinguino a terra. */
export const HOLD = 0.12;
const EPS = 1e-9;

/** Costruisce blocchi e mosse dai livelli. */
export function buildCourse(levels: readonly Pick<Level, 'obstacles'>[]): Course {
  const blocks: Block[] = [];
  const moves: Move[] = [];
  const anchors = [0];
  const spans: { x0: number; x1: number }[] = [];
  let x = 0;
  let y = 0;
  /** Fine del piano su cui si trova il pinguino. */
  let edge = 0;
  let level = -1;
  let beats = 0;

  const block = (kind: BlockKind, x0: number, x1: number, top = 0): void => {
    blocks.push({ kind, x0, x1, top, level });
  };
  const move = (
    kind: MoveKind,
    x1: number,
    y1: number,
    extra: { peak?: number; sag?: number } = {},
  ) => {
    const dx = Math.abs(x1 - x);
    const length =
      kind === 'jump'
        ? PACE.jump + dx * 0.08
        : kind === 'wave'
          ? PACE.wave
          : dx * (kind === 'walk' ? PACE.walk : kind === 'ride' ? PACE.ride : PACE.run);
    moves.push({
      kind,
      x0: x,
      y0: y,
      x1,
      y1,
      peak: extra.peak ?? Math.max(y, y1),
      sag: extra.sag ?? 0,
      beats: length,
      level,
    });
    beats += length;
    x = x1;
    y = y1;
  };
  /** Corsa fino a `to`, mai all'indietro (se gia oltre, mossa nulla). */
  const run = (to: number) => move('run', Math.max(x, to), y);
  /** Salto verso (to, top); la cima dell'arco sta `lift` sopra il piano piu alto. */
  const jump = (to: number, top: number, lift = 0.55) =>
    move('jump', to, top, { peak: Math.max(y, top) + lift });
  /** Scende a terra se si e su un piano rialzato: salto oltre il bordo, su un tratto di terreno. */
  const descend = (): void => {
    if (y === 0) return;
    run(edge - 0.3);
    const from = edge;
    block('ground', from, from + 1.6);
    jump(from + 0.8, 0, 0.4);
    edge = from + 1.6;
  };

  const pieces: Record<Obstacle, () => void> = {
    platform() {
      descend();
      const c = x;
      block('ground', c, c + 3.6);
      block('step', c + 0.9, c + 2.3, 0.5);
      run(c + 0.45);
      jump(c + 1.35, 0.5, 0.5);
      run(c + 2.0);
      jump(c + 2.95, 0, 0.45);
      run(c + 3.3);
      edge = c + 3.6;
    },
    container() {
      descend();
      const c = x;
      block('ground', c, c + 4.9);
      block('crate', c + 0.8, c + 1.8, 0.55);
      block('crate', c + 1.8, c + 2.8, 1.1);
      block('crate', c + 2.8, c + 3.8, 0.55);
      run(c + 0.35);
      jump(c + 1.2, 0.55, 0.45);
      jump(c + 2.2, 1.1, 0.45);
      run(c + 2.5);
      jump(c + 3.3, 0.55, 0.35);
      jump(c + 4.3, 0, 0.35);
      run(c + 4.6);
      edge = c + 4.9;
    },
    firewall() {
      descend();
      const c = x;
      block('ground', c, c + 3.8);
      block('wall', c + 1.55, c + 1.95, 1.45);
      run(c + 0.55);
      jump(c + 3.0, 0, 2.05);
      run(c + 3.4);
      edge = c + 3.8;
    },
    conveyor() {
      descend();
      const c = x;
      block('ground', c, c + 6.2);
      block('belt', c + 0.9, c + 4.9, 0.4);
      run(c + 0.45);
      jump(c + 1.3, 0.4, 0.45);
      move('ride', c + 4.5, 0.4);
      jump(c + 5.5, 0, 0.4);
      run(c + 5.8);
      edge = c + 6.2;
    },
    flag() {
      descend();
      const c = x;
      block('ground', c, c + 3.2);
      block('pole', c + 1.5, c + 1.6, 2.2);
      run(c + 2.8);
      edge = c + 3.2;
    },
    site() {
      if (y < SITE_HEIGHT) {
        descend();
        const c = x;
        block('ground', c, c + 1.0);
        block('site', c + 0.75, c + 3.25, SITE_HEIGHT);
        run(c + 0.3);
        jump(c + 1.15, SITE_HEIGHT, 0.45);
        edge = c + 3.25;
      } else {
        block('site', edge, edge + 2.5, SITE_HEIGHT);
        edge += 2.5;
      }
      run(edge - 0.3);
    },
    bridge() {
      // Il ponte parte dal bordo del piano attuale e porta a un piccolo pilone alla stessa quota.
      const from = edge;
      const to = from + 3.6;
      run(from);
      block('bridge', from, to, y);
      block('site', to, to + 0.7, y);
      move('run', to + 0.35, y, { sag: 0.18 });
      edge = to + 0.7;
    },
    garden() {
      descend();
      const c = x;
      block('garden', c, c + 5.2);
      move('walk', c + 4.9, 0);
      edge = c + 5.2;
    },
  };

  // Partenza: un piano lungo, il pinguino fermo poco dopo l'inizio.
  block('ground', -3.2, 1.0);
  edge = 1.0;
  levels.forEach((data, i) => {
    // Varco tra un livello e l'altro, sempre a terra dall'altra parte.
    level = i;
    descend();
    run(edge - 0.35);
    const start = edge + GAP;
    block('ground', start, start + 1.2);
    jump(start + 0.45, 0, 0.6);
    edge = start + 1.2;
    const first = moves.length - 1;
    const x0 = start;
    for (const piece of data.obstacles) pieces[piece]();
    spans.push({ x0, x1: edge });
    // Momento del livello: la fine di mossa piu vicina a meta del livello (sempre a terra).
    const levelMoves = moves.slice(first);
    const from = beats - levelMoves.reduce((sum, m) => sum + m.beats, 0);
    let best = from;
    let acc = from;
    for (const m of levelMoves) {
      acc += m.beats;
      const middle = from + (beats - from) / 2;
      if (Math.abs(acc - middle) < Math.abs(best - middle)) best = acc;
    }
    anchors.push(best);
  });
  // Arrivo: ultimo varco, un piano con la meta, il pinguino si ferma e saluta.
  level = -1;
  descend();
  run(edge - 0.35);
  const goal = edge + GAP;
  block('ground', goal, goal + 4.5);
  block('goal', goal + 2.6, goal + 3.8);
  jump(goal + 0.45, 0, 0.6);
  edge = goal + 4.5;
  run(goal + 1.9);
  move('wave', goal + 1.9, 0);
  anchors.push(beats);

  return { blocks, moves, anchors, spans, length: edge };
}

/** Battuta della posizione del racconto: lineare tra due momenti, ferma attorno a ciascuno. */
export function beatAt(course: Course, story: number): number {
  const { anchors } = course;
  const last = anchors.length - 1;
  const s = Math.min(last, Math.max(0, story));
  const from = Math.min(Math.floor(s), Math.max(0, last - 1));
  const raw = s - from;
  const u = Math.min(1, Math.max(0, (raw - HOLD) / (1 - 2 * HOLD)));
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
    const base = m.y0 + (m.y1 - m.y0) * t;
    // Ai bordi della mossa il pinguino e fermo e a terra: e il fotogramma di ogni momento.
    const still = (t <= 0 || t >= 1) && m.kind !== 'wave';
    const runner: Runner = {
      x,
      y: base,
      pose: 'stand',
      phase: 0,
      level: m.level,
      belt: m.kind === 'ride' ? t : 0,
    };
    if (still) return runner;
    if (m.kind === 'jump') {
      // Parabola per i due estremi con il vertice a `peak` (circa, se i due estremi differiscono).
      const rise = m.peak - Math.max(m.y0, m.y1);
      runner.y = base + 4 * (rise + Math.abs(m.y1 - m.y0) / 2) * t * (1 - t);
      return { ...runner, pose: 'jump', phase: t };
    }
    if (m.kind === 'wave') return { ...runner, pose: 'wave', phase: t * 3 };
    if (m.kind === 'ride') return { ...runner, pose: 'ride', phase: beat };
    runner.y = base - m.sag * Math.sin(Math.PI * t);
    return { ...runner, pose: 'run', phase: x / STRIDE };
  }
  const end = course.moves.at(-1);
  return {
    x: end?.x1 ?? 0,
    y: end?.y1 ?? 0,
    pose: end?.kind === 'wave' ? 'wave' : 'stand',
    phase: end?.kind === 'wave' ? 3 : 0,
    level: -1,
    belt: 0,
  };
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
 * tutte a sinistra e il pinguino a destra, con il percorso davanti a se: l'occhio non deve
 * rimbalzare da un lato all'altro mentre il pinguino corre sempre nella stessa direzione. Su
 * schermo stretto il percorso sta nella parte alta, sopra la scheda.
 */
export function cardFraming(widthPx: number): Framing {
  if (widthPx >= SIDE_BY_SIDE_PX) return { shift: 0.5, lift: 0 };
  return { shift: 0, lift: 0.33 };
}
