import { cardFraming, type Framing } from '../framing';

/*
 * Bacheca delle Certificazioni (spec §13, PORT-87). Logica PURA, senza three: disposizione degli
 * esagoni dai dati, inquadratura di ogni momento e contorni dei solidi. Una certificazione nuova
 * nei dati aggiunge uno slot; lo stato decide se l'esagono e pieno o in costruzione.
 */

export interface BoardCert {
  slug: string;
  status: 'earned' | 'in-progress';
  /** Oggetto accanto all'esagono: `cluster` = piccoli cubi collegati. */
  scenery?: 'cluster';
}

export interface BoardData {
  technical: BoardCert[];
  supplementary: BoardCert[];
}

export interface Slot {
  /** Vuoto per gli slot liberi. */
  slug: string;
  x: number;
  y: number;
  radius: number;
  /** Solo gli slot occupati: in costruzione (mezzo contorno, mezzo pieno) o pieno. */
  state?: 'building' | 'full';
}

export interface Board {
  slots: Slot[];
  /** Centro dei piccoli cubi accanto a un esagono, se presenti. */
  clusters: { x: number; y: number }[];
  /** Meta larghezza della parete, quota del pavimento e della cima. */
  halfWidth: number;
  floor: number;
  top: number;
  /**
   * Punto dei piedi del pinguino: davanti alla parete, a destra. Nelle schede la camera sta piu a
   * sinistra e lui resta fuori campo: si vede intero nelle viste larghe, mai tagliato.
   */
  penguin: { x: number; y: number; z: number };
}

export const BIG = 1;
export const SMALL = 0.42;
const PITCH = 2.35;
const SMALL_PITCH = 1.15;
const BIG_ROW = 1.15;
const SMALL_ROW = -1.15;
const FLOOR = -2.6;
const TOP = 2.9;
const MARGIN = 1;
/** Colonne minime della fila grande, cosi la bacheca ha sempre uno slot libero che aspetta. */
const MIN_COLUMNS = 4;

export function buildBoard({ technical, supplementary }: BoardData): Board {
  const columns: (BoardCert | 'cluster' | null)[] = [];
  for (const cert of technical) {
    columns.push(cert);
    if (cert.scenery === 'cluster') columns.push('cluster');
  }
  columns.push(null);
  while (columns.length < MIN_COLUMNS) columns.push(null);

  const slots: Slot[] = [];
  const clusters: Board['clusters'] = [];
  const stateOf = (status: BoardCert['status']): 'building' | 'full' =>
    status === 'earned' ? 'full' : 'building';
  columns.forEach((column, i) => {
    const x = (i - (columns.length - 1) / 2) * PITCH;
    if (column === 'cluster') clusters.push({ x, y: BIG_ROW });
    else if (column === null) slots.push({ slug: '', x, y: BIG_ROW, radius: BIG });
    else
      slots.push({
        slug: column.slug,
        x,
        y: BIG_ROW,
        radius: BIG,
        state: stateOf(column.status),
      });
  });
  supplementary.forEach(({ slug, status }, i) => {
    const x = (i - (supplementary.length - 1) / 2) * SMALL_PITCH;
    slots.push({ slug, x, y: SMALL_ROW, radius: SMALL, state: stateOf(status) });
  });

  const halfWidth =
    Math.max(columns.length * PITCH, supplementary.length * SMALL_PITCH + 5) / 2 + MARGIN;
  return {
    slots,
    clusters,
    halfWidth,
    floor: FLOOR,
    top: TOP,
    penguin: { x: halfWidth - 1.4, y: FLOOR, z: 1.3 },
  };
}

export interface View extends Framing {
  /** Punto inquadrato. */
  x: number;
  y: number;
  /** Larghezza e altezza da tenere in vista (unita). */
  spanW: number;
  spanH: number;
}

/** Inquadratura del momento `name`: prima schermata e uscita larghe, le schede strette sul badge. */
export function viewOf(name: string, board: Board, width: number, height: number): View {
  const wall = board.halfWidth * 2;
  const middle = (board.top + board.floor) / 2;
  const portrait = width < height;
  const card = cardFraming(width);
  const side = card.shift > 0;

  if (name === 'others') {
    // La camera si allarga: i badge piccoli in primo piano, le tecniche ancora sopra.
    return { x: 0, y: side ? -0.3 : -1.15, spanW: side ? 12.5 : 7, spanH: 5, ...card };
  }
  const slot = board.slots.find((s) => s.slug === name && s.radius === BIG);
  if (slot) {
    // Con i cubi accanto si inquadra la coppia: il centro cade tra l'esagono e i cubi.
    const near = board.clusters.find((c) => Math.abs(c.x - slot.x) < 3);
    const x = near ? (slot.x + near.x) / 2 : slot.x;
    return { x, y: slot.y, spanW: side ? 10 : near ? 6.4 : 5, spanH: 5.2, ...card };
  }
  if (name === 'overview' && side) {
    // Schermo largo: la bacheca lascia a sinistra lo spazio del titolo e dell'intro.
    return { x: 0, y: middle, spanW: (wall + 0.6) / 0.66, spanH: 8, shift: 0.3, lift: 0 };
  }
  if (name === 'overview' && portrait) {
    return { x: 0, y: middle, spanW: wall + 0.6, spanH: 8, shift: 0, lift: -0.12 };
  }
  return { x: 0, y: middle, spanW: wall + 1.5, spanH: 8, shift: 0, lift: 0 };
}

// --- Contorni e solidi -----------------------------------------------------------------------------

export type Polygon = readonly (readonly [number, number])[];

/** Esagono con la punta in alto, in senso antiorario. */
export function hexagon(radius: number): Polygon {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 2 + (i * Math.PI) / 3;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  });
}

/** La parte del poligono convesso con quota tra `low` e `high`. */
export function clipBand(polygon: Polygon, low: number, high: number): Polygon {
  const clip = (points: Polygon, limit: number, keep: (y: number) => boolean): Polygon => {
    const out: [number, number][] = [];
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length] as readonly [number, number];
      if (keep(a[1])) out.push([a[0], a[1]]);
      if (keep(a[1]) !== keep(b[1])) {
        const t = (limit - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * t, limit]);
      }
    });
    return out;
  };
  return clip(
    clip(polygon, low, (y) => y >= low),
    high,
    (y) => y <= high,
  );
}

/**
 * Triangoli (xyz piatti) di un prisma da `z0` a `z1` sul poligono antiorario: faccia davanti e
 * fianchi. Il retro manca: i solidi stanno appoggiati alla parete.
 */
export function prism(polygon: Polygon, z0: number, z1: number): number[] {
  const out: number[] = [];
  const first = polygon[0];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length] as readonly [number, number];
    out.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1);
    out.push(a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1);
    if (first && i > 0 && i < polygon.length - 1) {
      out.push(first[0], first[1], z1, a[0], a[1], z1, b[0], b[1], z1);
    }
  });
  return out;
}

/** Contorno esagonale: sei trapezi fusi in un solo solido, da `inner` a `outer`. */
export function hexRing(outer: number, inner: number, z0: number, z1: number): number[] {
  const out = hexagon(outer);
  const ins = hexagon(inner);
  return out.flatMap((a, i) => {
    const next = (i + 1) % 6;
    const b = out[next] as readonly [number, number];
    const c = ins[next] as readonly [number, number];
    const d = ins[i] as readonly [number, number];
    return prism([a, b, c, d], z0, z1);
  });
}
