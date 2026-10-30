import { interessiOrder, stationX } from './bench';
import { type Frame, type Mesher, mesher, type Rgb, type Ring } from './mesher';

/*
 * I sei oggetti del banco degli Interessi (PORT-92), giganti e generici: nessun logo, nessun
 * marchio. Un solo solido per le parti ferme; a parte solo cio che si muove. Piedi dei pezzi
 * affondati nel piano, cosi nessuna faccia e complanare. Logica pura, senza three.
 */

export interface BenchPalette {
  wood: Rgb;
  woodAlt: Rgb;
  apron: Rgb;
  wall: Rgb;
  wallLow: Rgb;
  /** Fasce di cielo, dall'orizzonte verso l'alto. */
  sky: readonly Rgb[];
  sun: Rgb;
  hillFar: Rgb;
  hillNear: Rgb;
  mat: Rgb;
  frame: Rgb;
  metal: Rgb;
  paper: Rgb;
  paperAlt: Rgb;
  ink: Rgb;
  accent: Rgb;
  alt: Rgb;
  print: Rgb;
  printAlt: Rgb;
  key: Rgb;
  rust: Rgb;
  rustAlt: Rgb;
  rock: Rgb;
  rockAlt: Rgb;
  food: Rgb;
  herb: Rgb;
  glass: Rgb;
  lid: Rgb;
}

export interface Layered {
  mesh: Mesher;
  /** Vertici di ogni strato o riga: la scena ne mostra un numero con `setDrawRange`. */
  step: number;
  count: number;
}

export interface Bench {
  still: Mesher;
  /** Pezzo sul piatto della stampante, uno strato sull'altro. */
  print: Layered;
  /** Traversa della stampante con la testina: `gantry` sale, `head` scorre. */
  gantry: Mesher;
  head: Mesher;
  /** Tasti dei due gruppi che si accendono a turno. */
  keysA: Mesher;
  keysB: Mesher;
  /** Righe sul tablet. */
  lines: Layered;
  /** Ingranaggi: costruiti attorno al loro asse. */
  gearBig: Mesher;
  gearSmall: Mesher;
  /** Cupola: costruita attorno alla cerniera. */
  lid: Mesher;
}

/** Fianco del piano: largo ben oltre ogni inquadratura, cosi il bordo non si vede mai. */
const REACH = 320;
const BENCH_BACK = -7;
const BENCH_FRONT = 50;
const PLANK = 3;
const WALL = BENCH_BACK;
/** Vetrata: quote di davanzale, traversa e architrave, passo dei montanti. */
const SILL = 3.6;
const TRANSOM = 17;
const HEADER = 34;
const MULLION = 13;
/** Cielo lontano dalla parete: si muove con la camera, da profondita. */
const SKY_Z = -56;
const BAND = 7;
const HILL = 9;
/** Altezza del tappetino sotto ogni oggetto. */
const MAT = 0.08;

// Stampante: piatto, strati e cerniere si leggono anche dalla scena.
const BED_Y = 0.7;
const PRINTER_Z = -1.3;
const LAYERS = 18;
const LAYER = 0.24;
export const printHeight = (done: number): number => BED_Y + LAYERS * LAYER * done + 0.35;

// Ingranaggi: raggi primitivi in proporzione ai denti, cosi ingranano.
const GEAR_Y = 3.3;
const GEAR_Z = -1.2;
const TEETH_BIG = 12;
const TEETH_SMALL = 8;
const PITCH_BIG = 2.4;
const PITCH_SMALL = 1.6;
export const GEAR_RATIO = TEETH_BIG / TEETH_SMALL;
/** Mezzo dente: in partenza un dente del grande entra nel vano del piccolo. */
export const GEAR_PHASE = Math.PI / TEETH_SMALL;

export const gearAxles = (rustX: number) => ({
  big: [rustX - 1.6, GEAR_Y, GEAR_Z] as const,
  small: [rustX - 1.6 + PITCH_BIG + PITCH_SMALL, GEAR_Y, GEAR_Z] as const,
});

// Cupola: incernierata sul bordo destro del piatto.
const PLATE_R = 3;
const PLATE_Y = 0.4;
const PLATE_Z = -0.6;
export const lidHinge = (foodX: number) => [foodX + 0.2 + PLATE_R, PLATE_Y + MAT, PLATE_Z] as const;

/** Ruota dentata nel piano XY, centrata sull'asse. */
function gearOutline(teeth: number, pitch: number): [number, number][] {
  const outline: [number, number][] = [];
  const step = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k += 1) {
    for (const [offset, radius] of [
      [-0.3, pitch - 0.24],
      [-0.14, pitch + 0.24],
      [0.14, pitch + 0.24],
      [0.3, pitch - 0.24],
    ] as const) {
      const angle = (k + offset) * step;
      outline.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  }
  return outline;
}

const spread = (index: number): number => stationX(index);

/** Fila di colline: spicchi a facce piane, altezza che sale e scende lungo X. */
function ridge(m: Mesher, z: number, height: number, wave: number, tint: Rgb): void {
  const top = (x: number) => height + 4 * Math.sin(x * wave) + 2.5 * Math.sin(x * wave * 2.3 + 1);
  for (let x = -REACH * 2.5; x < REACH * 2.5; x += HILL) {
    const [left, right] = [top(x), top(x + HILL)];
    const middle = (left + right) / 4;
    m.extrude(
      [
        [-HILL / 2, -middle],
        [HILL / 2, -middle],
        [HILL / 2, right - middle],
        [-HILL / 2, left - middle],
      ],
      1,
      tint,
      { x: x + HILL / 2, y: middle, z },
    );
  }
}

function buildRoom(m: Mesher, p: BenchPalette): void {
  // Parete con una vetrata continua: davanzale in basso, architrave in alto, montanti sottili.
  m.box(0, -2, WALL - 1, REACH * 2, SILL + 2, 2, p.wallLow);
  m.box(0, SILL, WALL + 0.4, REACH * 2, 0.5, 1.6, p.woodAlt);
  m.box(0, HEADER, WALL - 1, REACH * 2, 90, 2, p.wall);
  m.box(0, TRANSOM, WALL - 0.4, REACH * 2, 0.5, 0.5, p.frame);
  for (let x = -REACH; x <= REACH; x += MULLION) {
    m.box(x, SILL, WALL - 0.4, 0.6, HEADER - SILL, 0.6, p.frame);
  }
  // Fuori: il cielo a fasce, dal caldo dell'orizzonte al buio, un sole basso, due file di colline.
  p.sky.forEach((tint, i) => {
    m.box(0, -4 + i * BAND, SKY_Z, REACH * 5, BAND + 0.2, 1 + i * 0.1, tint);
  });
  const sun: [number, number][] = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i * Math.PI) / 8;
    sun.push([Math.cos(angle) * 7, Math.sin(angle) * 7]);
  }
  m.extrude(sun, 1, p.sun, { x: 14, y: 16, z: SKY_Z + 3 });
  ridge(m, SKY_Z + 7, 13, 0.03, p.hillFar);
  ridge(m, SKY_Z + 14, 9, 0.047, p.hillNear);
  const planks = Math.ceil((BENCH_FRONT - BENCH_BACK) / PLANK);
  for (let i = 0; i < planks; i += 1) {
    const tint = i % 2 ? p.wood : p.woodAlt;
    m.box(0, -1.2, BENCH_BACK + PLANK * (i + 0.5), REACH * 2, 1.2, PLANK - 0.06, tint);
  }
  // Sottopiano continuo: chiude le fughe tra le assi, un poco piu in basso.
  m.box(0, -1.6, (BENCH_BACK + BENCH_FRONT) / 2, REACH * 2, 1.5, BENCH_FRONT - BENCH_BACK, p.apron);
  m.box(0, -60, BENCH_FRONT - 0.6, REACH * 2, 59, 0.5, p.apron);
  interessiOrder.forEach((_, i) => {
    m.box(spread(i), -0.1, -0.9, 8.4, 0.1 + MAT, 7, p.mat);
  });
}

function buildPrinter(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const z = PRINTER_Z;
  m.box(x, 0, z, 6.4, 0.5, 5, p.frame);
  m.box(x, 0.4, z, 5, BED_Y - 0.4, 4.2, p.metal);
  for (const side of [-1, 1]) {
    m.box(x + side * 3, 0.4, z, 0.36, 7.4, 0.36, p.frame);
  }
  m.box(x, 7.7, z, 6.36, 0.36, 0.36, p.frame);
  bench.gantry.box(x, -0.1, z, 5.7, 0.2, 0.3, p.metal);
  bench.head.box(x, -0.32, z, 0.8, 0.7, 0.8, p.frame);
  bench.head.box(x, -0.55, z, 0.24, 0.3, 0.24, p.ink);
  // Il pezzo: una piramide a gradoni, squadrata, uno strato sull'altro.
  for (let i = 0; i < LAYERS; i += 1) {
    const r = 2.1 - 0.3 * Math.floor(i / 3);
    const y = BED_Y - 0.02 + i * LAYER;
    const rings: readonly Ring[] = [
      [r, y],
      [r, y + LAYER],
    ];
    bench.print.mesh.lathe(rings, 4, i % 2 ? p.printAlt : p.print, { x, z, ry: Math.PI / 4 });
  }
  // Il pezzo storto: gli strati scivolano, succede.
  for (let i = 0; i < 6; i += 1) {
    const y = i * LAYER;
    const rings: readonly Ring[] = [
      [1.1, y],
      [1.1, y + LAYER],
    ];
    m.lathe(rings, 4, i % 2 ? p.printAlt : p.print, {
      x: x + 2.1 + i * i * 0.03,
      z: 2.1,
      ry: Math.PI / 4,
    });
  }
}

function buildKeyboard(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const PITCH = 0.62;
  for (const side of [-1, 1]) {
    const f: Frame = { x: x + side * 2.15, y: 0, z: -1.3, ry: -side * 0.16 };
    m.box(0, 0, 0, 3.9, 0.5, 3.45, p.frame, f);
    m.box(side * -0.5, 0, 2.2, 2.2, 0.5, 1.1, p.frame, { ...f, ry: f.ry ?? 0 });
    for (let col = 0; col < 6; col += 1) {
      for (let row = 0; row < 5; row += 1) {
        // Gruppo A: i tasti di gioco a sinistra. Gruppo B: i simboli a portata a destra.
        const a =
          side < 0 &&
          ((col === 2 && row >= 1 && row <= 2) || (row === 2 && (col === 1 || col === 3)));
        const b = side > 0 && (col >= 4 || (row === 0 && col >= 1));
        const target = a ? bench.keysA : b ? bench.keysB : m;
        target.box((col - 2.5) * PITCH, 0.4, (row - 2) * PITCH, 0.52, 0.28, 0.52, p.key, f);
      }
    }
    for (let k = 0; k < 3; k += 1) {
      m.box(side * -0.5 + (k - 1) * 0.68, 0.4, 2.2, 0.56, 0.28, 0.72, p.key, f);
    }
  }
  m.box(x, 0, -2.4, 1.4, 0.1 + MAT + 0.1, 0.16, p.ink);
}

function buildTablet(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const f: Frame = { x, y: 0.1, z: -1.6, rx: -0.34 };
  m.box(0, 0, 0, 4.8, 6.6, 0.3, p.frame, f);
  m.box(0, 0.45, 0.12, 4.2, 5.8, 0.1, p.paper, f);
  // Puntello dietro al tablet e battuta davanti, cosi non scivola.
  m.box(0, 0, 0, 2, 2.6, 0.3, p.frame, { x, z: -3.35, rx: 0.3 });
  m.box(x, 0, -1.25, 5, 0.3, 0.5, p.frame);
  const widths = [3.4, 3, 3.5, 2.2, 3.3, 2.9, 3.4, 1.8];
  widths.forEach((w, i) => {
    bench.lines.mesh.box(-1.75 + w / 2, 5.3 - i * 0.62, 0.21, w, 0.16, 0.06, p.ink, f);
  });
  // Penna appoggiata davanti.
  bench.still.lathe(
    [
      [0.03, -2.1],
      [0.16, -1.7],
      [0.16, 1.9],
      [0.1, 2.1],
    ],
    6,
    p.accent,
    { x: x - 0.2, y: 0.24, z: 1.6, rz: Math.PI / 2, ry: 0.2 },
  );
}

function buildNotes(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const stack = (cx: number, cz: number, w: number, d: number, sheets: number): number => {
    for (let i = 0; i < sheets; i += 1) {
      const tint = i % 2 ? p.paper : p.paperAlt;
      m.box(0, -0.02 + i * 0.13, 0, w, 0.15, d, tint, {
        x: cx,
        z: cz,
        ry: Math.sin(i * 2.4) * 0.09,
      });
    }
    return sheets * 0.13;
  };
  const nodes: [number, number][] = [
    [-2.7, 1.2],
    [2.8, 1],
    [-2.6, -3],
    [2.7, -3.1],
  ];
  const top = stack(x, -1, 3.2, 4, 9);
  for (const [dx, dz] of nodes) stack(x + dx, dz, 1.5, 1.8, 3);
  // Fili tra gli appunti: sottili, rialzati sul tappetino.
  for (const [dx, dz] of nodes) {
    const length = Math.hypot(dx, dz + 1);
    m.box(0, 0.08, 0, 0.1, 0.1, length, p.accent, {
      x: x + dx / 2,
      z: (dz - 1) / 2,
      ry: Math.atan2(dx, dz + 1),
    });
  }
  // Ossidiana vera: una roccia scura e irregolare, non un logo.
  const wobble = (i: number) => 0.8 + 0.3 * Math.abs(Math.sin(i * 2.1));
  m.lathe(
    [
      [1, 0],
      [1.45, 0.8],
      [1.15, 1.9],
      [0.5, 2.7],
      [0, 3],
    ],
    7,
    (face) => (face % 3 === 0 ? p.rockAlt : p.rock),
    { x: x + 0.1, y: top - 0.05, z: -1 },
    wobble,
  );
}

function buildGears(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const { big, small } = gearAxles(x);
  m.box(x + 0.4, 0, GEAR_Z - 0.9, 8, 0.4, 2.6, p.frame);
  for (const [ax, ay] of [big, small]) {
    m.box(ax, 0, GEAR_Z - 0.9, 0.7, ay + 0.3, 0.5, p.frame);
    m.lathe(
      [
        [0.24, -0.1],
        [0.24, 1.7],
      ],
      8,
      p.metal,
      { x: ax, y: ay, z: GEAR_Z - 1.1, rx: Math.PI / 2 },
    );
  }
  const tint = (face: number) => (face % 5 === 0 ? p.rustAlt : p.rust);
  bench.gearBig.extrude(gearOutline(TEETH_BIG, PITCH_BIG), 0.6, tint);
  bench.gearSmall.extrude(gearOutline(TEETH_SMALL, PITCH_SMALL), 0.6, tint);
}

function buildFood(bench: Bench, x: number, p: BenchPalette): void {
  const m = bench.still;
  const plate = { x: x + 0.2, z: PLATE_Z };
  m.lathe(
    [
      [1.8, 0],
      [PLATE_R, PLATE_Y],
      [PLATE_R - 0.16, PLATE_Y + 0.06],
      [1.9, 0.2],
    ],
    12,
    p.paper,
    plate,
  );
  m.lathe(
    [
      [1.5, 0.1],
      [1.45, 0.5],
      [0.9, 0.95],
      [0, 1.15],
    ],
    9,
    (face) => (face % 2 ? p.food : p.alt),
    plate,
    (i) => 0.9 + 0.14 * Math.abs(Math.sin(i * 1.7)),
  );
  m.lathe(
    [
      [0.22, 1],
      [0.3, 1.2],
      [0, 1.45],
    ],
    5,
    p.herb,
    { x: plate.x + 0.3, z: PLATE_Z + 0.2 },
  );
  // Forchetta a sinistra, bicchiere in fondo.
  m.box(x - 3.5, 0, 0.5, 0.26, 0.24, 3.3, p.metal);
  for (const k of [-1, 0, 1]) m.box(x - 3.5 + k * 0.2, 0, -1.8, 0.1, 0.24, 1.4, p.metal);
  m.lathe(
    [
      [0.7, 0],
      [0.95, 2.8],
    ],
    8,
    p.glass,
    { x: x + 2.9, z: -3.6 },
  );
  // Cupola: chiusa e posata sul piatto, la scena la apre sulla cerniera.
  bench.lid.lathe(
    [
      [PLATE_R - 0.2, 0.04],
      [PLATE_R - 0.3, 0.9],
      [2.1, 1.7],
      [1.2, 2.2],
      [0.3, 2.42],
      [0.42, 2.7],
      [0, 2.9],
    ],
    12,
    p.lid,
    { x: -PLATE_R, y: 0 },
  );
}

export function buildBench(palette: BenchPalette): Bench {
  const layered = (count: number): Layered => ({ mesh: mesher(), step: 0, count });
  const bench: Bench = {
    still: mesher(),
    print: layered(LAYERS),
    gantry: mesher(),
    head: mesher(),
    keysA: mesher(),
    keysB: mesher(),
    lines: layered(8),
    gearBig: mesher(),
    gearSmall: mesher(),
    lid: mesher(),
  };
  buildRoom(bench.still, palette);
  buildPrinter(bench, spread(0), palette);
  buildKeyboard(bench, spread(1), palette);
  buildTablet(bench, spread(2), palette);
  buildNotes(bench, spread(3), palette);
  buildGears(bench, spread(4), palette);
  buildFood(bench, spread(5), palette);
  bench.print.step = bench.print.mesh.vertices() / bench.print.count;
  bench.lines.step = bench.lines.mesh.vertices() / bench.lines.count;
  return bench;
}
