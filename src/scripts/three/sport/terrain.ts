import type { Point } from './course';

/*
 * Montagna di Sport (PORT-88), ispirata al Monte Bianco. Logica PURA, senza three: quota del
 * terreno (griglia regolare 1 x 1, faccette grandi) e buffer della mesh unica colorata per
 * faccia. Terreno, alberi, rifugi, campi e reti stanno nello stesso buffer. Tre versanti: pista
 * al centro, sentiero a sinistra, campi da tennis e pallavolo a destra.
 */

export type Rgb = readonly [number, number, number];

export interface TerrainPalette {
  snow: Rgb;
  ice: Rgb;
  rock: Rgb;
  meadow: Rgb;
  forest: Rgb;
  soil: Rgb;
  clay: Rgb;
  court: Rgb;
  line: Rgb;
  wood: Rgb;
  roof: Rgb;
}

export interface Court extends Point {
  /** Lunghezza lungo X, larghezza lungo Z. */
  length: number;
  width: number;
}

/** Da qui verso la camera il prato piano ha qualche albero. */
const FRONT_Z = 19;
/** Campi su un ripiano a quota 0, bordi allineati alla griglia (colorano facce intere). */
export const TENNIS: Court = { x: 19, z: 12, length: 10, width: 6 };
export const VOLLEY: Court = { x: 19, z: 4, length: 8, width: 4 };

/** Griglia: angolo e celle per lato. Un vertice per ogni coppia di interi. */
export const GRID = { x0: -52, z0: -28, nx: 104, nz: 62 } as const;
const { x0: X0, z0: Z0, nx: NX, nz: NZ } = GRID;
const W = NX + 1;

const sstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// --- Forma della montagna --------------------------------------------------------------------

/**
 * Cupole arrotondate (profilo (1 - d^2)^p): x, z, raggio in x, raggio davanti (z crescente) e
 * dietro, altezza, p. La prima e la vetta del Monte Bianco, poi il Maudit e la spalla ampia del
 * Gouter a destra.
 */
const DOMES = [
  [3, -16, 23, 36, 13, 17.5, 1.15],
  [-9, -14, 11, 17, 12, 13.5, 1.3],
  [17, -16, 14, 15, 12, 12.5, 1.1],
] as const;
/** Guglie a punta (stile Aiguilles): x, z, raggio in x e in z, altezza. */
const SPIRES = [
  [-17, -11, 5, 5.5, 13.5],
  [-23, -9, 5, 5, 12],
  [-28, -5, 4.5, 5, 10],
  [-20, -15, 4.5, 5, 14.5],
  [-14, -5, 3, 3.5, 9],
  [26, -17, 6, 7, 10.5],
] as const;
/** Scanalature radiali dalla vetta: creste di roccia e valli di ghiaccio. */
const flute = (x: number, z: number): number => Math.sin(8 * Math.atan2(z + 16, x - 3) + 0.6);

function massif(x: number, z: number): number {
  let h = 0;
  for (let k = 0; k < DOMES.length; k += 1) {
    const [cx, cz, rx, rf, rb, top, p] = DOMES[k] as (typeof DOMES)[number];
    const u = (x - cx) / rx;
    const w = (z - cz) / (z > cz ? rf : rb);
    const d2 = u * u + w * w;
    if (d2 >= 1) continue;
    // Solo la vetta e scanalata, e solo oltre la calotta.
    const ribs = top > 17 ? 1 + 0.07 * flute(x, z) * sstep(0.15, 0.5, Math.sqrt(d2)) : 1;
    h = Math.max(h, top * (1 - d2) ** p * ribs);
  }
  for (let k = 0; k < SPIRES.length; k += 1) {
    const [cx, cz, rx, rz, top] = SPIRES[k] as (typeof SPIRES)[number];
    const u = (x - cx) / rx;
    const w = (z - cz) / rz;
    const d = Math.sqrt(u * u + w * w);
    if (d < 1) h = Math.max(h, top * (1 - d) ** 1.25);
  }
  h = Math.max(
    h,
    // Ripiano a sinistra: sale piano fino alla sella del rifugio.
    7 * sstep(20, -4, z) * sstep(-4, -12, x) * sstep(-38, -30, x) * sstep(-18, -8, z),
    // Crinali lontani sullo sfondo e ai lati: nessun bordo del terreno in vista.
    z < -8 ? 9 * sstep(-8, -28, z) * (0.75 + 0.25 * Math.sin(x * 0.17 + z * 0.3)) : 0,
    Math.abs(x) > 36 ? 7 * sstep(36, 58, Math.abs(x)) * (0.8 + 0.2 * Math.sin(z * 0.3)) : 0,
  );
  // Crepacci: solchi sottili sul ghiacciaio.
  const v = h > 5 && h < 12.5 ? Math.sin(z * 0.85 + x * 0.3 + Math.sin(x * 0.5) * 1.5) : 0;
  if (v > 0.88 && flute(x, z) < -0.2) h -= (v - 0.88) * 4;
  const lumps = 0.35 * Math.sin(x * 1.3 + z * 0.7) * Math.sin(z * 1.1 - x * 0.4);
  const swell = 0.18 * Math.sin(x * 0.31 + 1) * Math.sin(z * 0.27);
  return h + lumps * sstep(1, 4, h) + swell * (1 - sstep(0.5, 2, h));
}

/** Ripiano a quota 0 dei campi, raccordato al terreno in 5 unita. */
const SHELF = { x: 19.5, z: 8.5, hx: 7.5, hz: 8.5 };
const raw = (x: number, z: number): number =>
  mix(
    massif(x, z),
    0,
    sstep(5, 0, Math.max(Math.abs(x - SHELF.x) - SHELF.hx, Math.abs(z - SHELF.z) - SHELF.hz)),
  );

// --- Percorsi --------------------------------------------------------------------------------

/**
 * Percorso a passi di 0,5 dal punto (x, z) con direzione `h` (0 = verso +Z, camera). `steps`
 * alterna tratti dritti (lunghezza) e archi di raggio `r` (angolo in radianti, con segno).
 */
function walk(x: number, z: number, h: number, r: number, steps: number[]): Point[] {
  const out: Point[] = [{ x, z }];
  steps.forEach((amount, k) => {
    const arc = k % 2 === 1;
    const n = Math.max(1, Math.round((arc ? Math.abs(amount) * r : amount) / 0.5));
    const turn = arc ? amount / n : 0;
    for (let i = 0; i < n; i += 1) {
      const mid = h + turn / 2;
      x += (arc ? 2 * r * Math.sin(Math.abs(turn) / 2) : 0.5) * Math.sin(mid);
      z += (arc ? 2 * r * Math.sin(Math.abs(turn) / 2) : 0.5) * Math.cos(mid);
      h += turn;
      out.push({ x, z });
    }
  });
  return out;
}

/** Pista: dall'alto al basso, due curve larghe. */
export const PISTE: readonly Point[] = walk(4, 3, -1.22, 3.5, [6, 2.44, 2, -2.44, 1]);
/** Sentiero: dal prato alla sella del rifugio, quattro tornanti dolci verso nord (-Z). */
export const TRAIL: readonly Point[] = walk(
  -11,
  17.5,
  -1.75,
  2,
  [4, -2.79, 4, 2.79, 4, -2.79, 4, 2.79, 3],
);

interface Lay {
  pts: readonly Point[];
  hs: number[];
  /** Rettangolo (x0, x1, z0, z1) oltre il quale il percorso non conta piu. */
  box: [number, number, number, number];
}

/** Quote di progetto lungo un percorso: media mobile, estremi del terreno, sempre in un verso. */
function lay(pts: readonly Point[], reach: number, up: boolean, ramp: number): Lay {
  const r = pts.map((p) => raw(p.x, p.z));
  const n = r.length;
  const hs = r.map((_, i) => {
    let sum = 0;
    for (let k = i - reach; k <= i + reach; k += 1) {
      sum += r[Math.min(n - 1, Math.max(0, k))] as number;
    }
    return sum / (2 * reach + 1);
  });
  const e0 = (r[0] as number) - (hs[0] as number);
  const e1 = (r[n - 1] as number) - (hs[n - 1] as number);
  for (let i = 0; i < n; i += 1) {
    hs[i] = (hs[i] as number) + mix(e0, e1, i / (n - 1));
    if (i) hs[i] = (up ? Math.max : Math.min)(hs[i] as number, hs[i - 1] as number);
  }
  // Pendenza piu regolare: meta strada tra terreno e rampa lineare dal primo all'ultimo punto.
  const [top, bottom] = [hs[0] as number, hs[n - 1] as number];
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    pts,
    hs: hs.map((y, i) => mix(y, mix(top, bottom, i / (n - 1)), ramp)),
    box: [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...zs) - 6, Math.max(...zs) + 6],
  };
}

/** Distanza dal percorso e quota di progetto pesata (continua anche tra due tornanti). */
function near({ pts, hs, box }: Lay, x: number, z: number): [number, number] {
  if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) return [99, 0];
  let best = 1e9;
  let sum = 0;
  let acc = 0;
  for (let k = 0; k < pts.length; k += 1) {
    const p = pts[k] as Point;
    const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d2 < best) best = d2;
    const g = 1 / (d2 * d2 + 0.05);
    sum += g;
    acc += g * (hs[k] as number);
  }
  return [Math.sqrt(best), acc / sum];
}

/** Punto a `d` unita oltre l'estremo del percorso, nel suo verso. */
function beyond(pts: readonly Point[], end: boolean, d: number): Point {
  const a = (end ? pts[pts.length - 2] : pts[1]) as Point;
  const b = (end ? pts[pts.length - 1] : pts[0]) as Point;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: b.x + ((b.x - a.x) / len) * d, z: b.z + ((b.z - a.z) / len) * d };
}

/** Rifugi (centro, semilato): stazione a monte e a valle della pista, rifugio sulla sella. */
const HUTS: readonly (readonly [Point, number])[] = [
  [beyond(PISTE, false, 2), 0.9],
  [beyond(PISTE, true, 2.2), 0.9],
  [beyond(TRAIL, true, 2), 1.1],
];

// --- Griglia delle quote ---------------------------------------------------------------------

interface Grid {
  h: Float32Array;
  /** Distanza di ogni vertice da pista e sentiero. */
  dp: Float32Array;
  dt: Float32Array;
}

let cache: Grid | undefined;

function build(): Grid {
  const ski = lay(PISTE, 6, false, 0.55);
  const trail = lay(TRAIL, 16, true, 0.3);
  const h = new Float32Array(W * (NZ + 1));
  const dp = new Float32Array(h.length);
  const dt = new Float32Array(h.length);
  for (let j = 0; j <= NZ; j += 1) {
    for (let i = 0; i <= NX; i += 1) {
      const x = X0 + i;
      const z = Z0 + j;
      const [p, hp] = near(ski, x, z);
      const [t, ht] = near(trail, x, z);
      const y = mix(raw(x, z), hp, sstep(5.2, 2.4, p));
      h[j * W + i] = mix(y, ht, sstep(3.8, 1.5, t));
      dp[j * W + i] = p;
      dt[j * W + i] = t;
    }
  }
  // Piazzole sotto la stazione a monte e il rifugio: alla quota dell'estremo del percorso.
  const pads: [Point, number][] = [
    [(HUTS[0] as (typeof HUTS)[number])[0], ski.hs[0] as number],
    [(HUTS[2] as (typeof HUTS)[number])[0], trail.hs[trail.hs.length - 1] as number],
  ];
  for (const [c, level] of pads) {
    for (let j = 0; j <= NZ; j += 1) {
      for (let i = 0; i <= NX; i += 1) {
        const w = sstep(4.2, 2.2, Math.hypot(X0 + i - c.x, Z0 + j - c.z));
        if (w > 0) h[j * W + i] = mix(h[j * W + i] as number, level, w);
      }
    }
  }
  return { h, dp, dt };
}
const grid = (): Grid => {
  cache ??= build();
  return cache;
};

/**
 * Quota della superficie triangolata: stessa suddivisione della mesh (diagonale alternata),
 * quindi coincide con i vertici e con ogni punto delle facce. Fuori griglia: bordo esteso.
 */
export function heightAt(x: number, z: number): number {
  const { h } = grid();
  const u = Math.min(NX, Math.max(0, x - X0));
  const v = Math.min(NZ, Math.max(0, z - Z0));
  const i = Math.min(NX - 1, Math.floor(u));
  const j = Math.min(NZ - 1, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const at = (a: number, b: number) => h[(j + b) * W + i + a] as number;
  const h00 = at(0, 0);
  const h10 = at(1, 0);
  const h01 = at(0, 1);
  const h11 = at(1, 1);
  if ((i + j) & 1) {
    return fu >= fv
      ? h00 + (fu - fv) * (h10 - h00) + fv * (h11 - h00)
      : h00 + (fv - fu) * (h01 - h00) + fu * (h11 - h00);
  }
  return fu + fv <= 1
    ? h00 + fu * (h10 - h00) + fv * (h01 - h00)
    : h11 + (1 - fu) * (h01 - h11) + (1 - fv) * (h10 - h11);
}

// --- Buffer ----------------------------------------------------------------------------------

const inRect = (c: Court, x: number, z: number, m: number): boolean =>
  Math.abs(x - c.x) < c.length / 2 + m && Math.abs(z - c.z) < c.width / 2 + m;

type V = readonly [number, number, number];

export function terrainBuffers(pal: TerrainPalette): {
  positions: Float32Array;
  colors: Float32Array;
} {
  const { h, dp, dt } = grid();
  let P = new Float32Array(1 << 18);
  let C = new Float32Array(1 << 18);
  let n = 0;
  /** Un triangolo, tre vertici (9 numeri), colore unico. */
  const tri9 = (
    c: Rgb,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    dx: number,
    dy: number,
    dz: number,
  ): void => {
    if (n + 9 > P.length) {
      const grown = [new Float32Array(n * 2), new Float32Array(n * 2)] as const;
      grown[0].set(P);
      grown[1].set(C);
      [P, C] = grown;
    }
    P[n] = ax;
    P[n + 1] = ay;
    P[n + 2] = az;
    P[n + 3] = bx;
    P[n + 4] = by;
    P[n + 5] = bz;
    P[n + 6] = dx;
    P[n + 7] = dy;
    P[n + 8] = dz;
    for (let k = 0; k < 9; k += 3) {
      C[n + k] = c[0];
      C[n + k + 1] = c[1];
      C[n + k + 2] = c[2];
    }
    n += 9;
  };
  const tri = (c: Rgb, a: V, b: V, d: V): void =>
    tri9(c, a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
  const quad = (c: Rgb, a: V, b: V, d: V, e: V): void => {
    tri(c, a, b, d);
    tri(c, a, d, e);
  };
  /** Solido semplice senza fondo (poggia sul terreno): cima e quattro lati. */
  const box = (c: Rgb, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    quad(c, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    quad(c, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    quad(c, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]);
    quad(c, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]);
    quad(c, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
  };
  /** Piramide a `n` lati: base sul cerchio `r` a quota `y`, punta sopra il centro. */
  const cone = (
    c: Rgb,
    x: number,
    z: number,
    y: number,
    r: number,
    hgt: number,
    n: number,
    turn: number,
  ) => {
    const ring = (k: number): V => {
      const a = turn + (k * 2 * Math.PI) / n;
      return [x + r * Math.cos(a), y, z + r * Math.sin(a)];
    };
    const top: V = [x, y + hgt, z];
    for (let k = 0; k < n; k += 1) tri(c, top, ring(k + 1), ring(k));
  };
  /** Quota piu bassa nel raggio `r` attorno a (x, z): le basi non restano mai in aria. */
  const low = (x: number, z: number, r: number): number => {
    let y = heightAt(x, z);
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      y = Math.min(y, heightAt(x + r * Math.cos(a), z + r * Math.sin(a)));
    }
    return y;
  };

  // --- Terreno ---------------------------------------------------------------------------
  /** Valli tra le creste della vetta: lingue di ghiacciaio. */
  const glacier = (x: number, z: number, y: number): boolean =>
    y < 13.5 && z < 6 && x > -9 && x < 26 && flute(x, z) < -0.15;
  const face = (q0: number, q1: number, q2: number): void => {
    const [ax, bx, dx] = [X0 + (q0 % W), X0 + (q1 % W), X0 + (q2 % W)];
    const [az, bz, dz] = [
      Z0 + Math.floor(q0 / W),
      Z0 + Math.floor(q1 / W),
      Z0 + Math.floor(q2 / W),
    ];
    const [ay, by, dy] = [h[q0] as number, h[q1] as number, h[q2] as number];
    const nx = (by - ay) * (dz - az) - (bz - az) * (dy - ay);
    const ny = (bz - az) * (dx - ax) - (bx - ax) * (dz - az);
    const nz = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const up = ny / Math.hypot(nx, ny, nz);
    const cx = (ax + bx + dx) / 3;
    const cz = (az + bz + dz) / 3;
    const y = (ay + by + dy) / 3;
    const mean = (arr: Float32Array) =>
      ((arr[q0] as number) + (arr[q1] as number) + (arr[q2] as number)) / 3;
    const salt = hash(Math.floor(cx * 2), Math.floor(cz * 2));
    let c: Rgb;
    if (inRect(TENNIS, cx, cz, 0)) c = pal.clay;
    else if (inRect(VOLLEY, cx, cz, 0)) c = pal.court;
    else if (inRect(TENNIS, cx, cz, 1) || inRect(VOLLEY, cx, cz, 1)) c = pal.soil;
    else if (mean(dp) < 0.8 + 0.5 * Math.min(y, 2.2)) c = pal.snow;
    else if (mean(dt) < 0.9) c = pal.soil;
    else if (up < 0.5 && y > 1.5) c = pal.rock;
    else if (y > 7 + salt) {
      c = up < 0.62 && y < 11 ? pal.rock : glacier(cx, cz, y) ? pal.ice : pal.snow;
    } else if (y > 3.5 && up > 0.62 && glacier(cx, cz, y)) c = pal.ice;
    else if (y > 5) c = up < 0.7 || salt < 0.1 ? pal.rock : pal.snow;
    else c = y > 1 && salt < 0.22 ? pal.forest : pal.meadow;
    tri9(c, ax, ay, az, bx, by, bz, dx, dy, dz);
  };
  for (let j = 0; j < NZ; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const q = j * W + i;
      if ((i + j) & 1) {
        face(q, q + W, q + W + 1);
        face(q, q + W + 1, q + 1);
      } else {
        face(q, q + W, q + 1);
        face(q + 1, q + W, q + W + 1);
      }
    }
  }
  // Prolungamento piatto verso la camera: nessun bordo in vista con inquadrature alte.
  for (let i = 0; i < NX; i += 1) {
    const q = NZ * W + i;
    const z1 = Z0 + NZ;
    const [a, b] = [h[q] as number, h[q + 1] as number];
    quad(
      pal.meadow,
      [X0 + i, a, z1],
      [X0 + i, a, z1 + 90],
      [X0 + i + 1, b, z1 + 90],
      [X0 + i + 1, b, z1],
    );
  }

  // --- Campi -----------------------------------------------------------------------------
  const L = 0.12;
  const LINE = 0.03;
  const net = (c: Court, top: number, drop: number): void => {
    const edge = c.width / 2 + 0.25;
    for (const s of [-1, 1]) {
      box(
        pal.wood,
        c.x - 0.06,
        0,
        c.z + s * edge - 0.06,
        c.x + 0.06,
        top + 0.1,
        c.z + s * edge + 0.06,
      );
    }
    box(pal.line, c.x - 0.03, top - drop, c.z - edge + 0.06, c.x + 0.03, top, c.z + edge - 0.06);
  };
  const outline = (c: Court, inset: number): void => {
    const x0 = c.x - c.length / 2 + inset;
    const x1 = c.x + c.length / 2 - inset;
    const z0 = c.z - c.width / 2 + inset;
    const z1 = c.z + c.width / 2 - inset;
    box(pal.line, x0, 0, z0, x1, LINE, z0 + L);
    box(pal.line, x0, 0, z1 - L, x1, LINE, z1);
    box(pal.line, x0, 0, z0 + L, x0 + L, LINE, z1 - L);
    box(pal.line, x1 - L, 0, z0 + L, x1, LINE, z1 - L);
  };
  outline(TENNIS, 0.5);
  for (const s of [-1, 1]) {
    const x = TENNIS.x + s * 2.4;
    box(pal.line, x - L / 2, 0, TENNIS.z - 2.5 + L, x + L / 2, LINE, TENNIS.z + 2.5 - L);
  }
  box(
    pal.line,
    TENNIS.x - 2.4 + L / 2,
    0,
    TENNIS.z - L / 2,
    TENNIS.x + 2.4 - L / 2,
    LINE,
    TENNIS.z + L / 2,
  );
  net(TENNIS, 0.9, 0.55);
  outline(VOLLEY, 0.3);
  for (const s of [-1, 1]) {
    const x = VOLLEY.x + s * 1.4;
    box(pal.line, x - L / 2, 0, VOLLEY.z - 1.7 + L, x + L / 2, LINE, VOLLEY.z + 1.7 - L);
  }
  net(VOLLEY, 1.4, 0.5);

  // --- Rifugi ----------------------------------------------------------------------------
  for (const [c, a] of HUTS) {
    const y = low(c.x, c.z, a * 1.2);
    box(pal.wood, c.x - a, y - 0.4, c.z - a, c.x + a, y + 1, c.z + a);
    cone(pal.roof, c.x, c.z, y + 1, (a + 0.25) * Math.SQRT2, 0.8, 4, Math.PI / 4);
  }

  // --- Bosco -----------------------------------------------------------------------------
  const clear = (x: number, z: number, i: number, j: number): boolean => {
    if ((dp[j * W + i] as number) < 3.6 || (dt[j * W + i] as number) < 2.6) return false;
    if (Math.abs(x - SHELF.x) < SHELF.hx + 1 && Math.abs(z - SHELF.z) < SHELF.hz + 1) return false;
    return HUTS.every(([c]) => Math.hypot(x - c.x, z - c.z) > 3.5);
  };
  for (let j = 4; j < NZ; j += 1) {
    for (let i = 8; i < NX - 8; i += 1) {
      if (hash(i, j) > 0.5) continue;
      const x = X0 + i + 0.5 + (hash(j, i) - 0.5) * 0.7;
      const z = Z0 + j + 0.5 + (hash(i + 7, j) - 0.5) * 0.7;
      const y = heightAt(x, z);
      const steep = Math.hypot(heightAt(x + 0.6, z) - y, heightAt(x, z + 0.6) - y) / 0.6;
      // Sul prato piano solo davanti ai campi: un bosco basso che chiude il primo piano.
      const skip = y < 0.4 && (z < FRONT_Z || hash(i + 5, j) > 0.7);
      if (skip || y > 5.2 - hash(j, i + 3) * 1.2 || steep > 0.75 || !clear(x, z, i, j)) continue;
      const s = 0.8 + hash(i + 3, j + 5) * 0.5;
      cone(pal.forest, x, z, low(x, z, 0.7 * s) - 0.1, 0.75 * s, 2.5 * s, 5, hash(i, j + 9) * 6);
    }
  }
  // Oltre la griglia il bosco continua sul prato: l'inquadratura verticale arriva fin qui.
  for (let j = 0; j < 16; j += 1) {
    for (let i = 0; i < 40; i += 1) {
      if (hash(i + 11, j) > 0.55) continue;
      const x = -30 + i * 1.7 + hash(j, i + 2);
      const z = Z0 + NZ + 1 + j * 1.7 + hash(i + 2, j);
      cone(pal.forest, x, z, -0.1, 0.8, 2.6, 5, hash(i, j) * 6);
    }
  }
  return { positions: P.slice(0, n), colors: C.slice(0, n) };
}
