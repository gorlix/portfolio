import { ease } from '../story';

/*
 * Territorio di Beneficenza (PORT-93). Logica PURA, senza three: colline basse, quartieri, reti di
 * luci e pannello del sito. Terreno, case, alberi e pannello sono una sola mesh colorata per faccia;
 * le reti sono un elenco di luci e collegamenti, ognuno con la finestra di racconto in cui si
 * accende. Tre quartieri, uno per distretto del Multidistretto: forme generiche, nessun nome.
 */

export type Rgb = readonly [number, number, number];
export type Vec = readonly [number, number, number];

export interface TerritoryPalette {
  meadow: Rgb;
  field: Rgb;
  wood: Rgb;
  garden: Rgb;
  wall: Rgb;
  roof: Rgb;
  stone: Rgb;
  panel: Rgb;
  /** Il terreno sfuma qui verso i bordi: il fondo della pagina. */
  fade: Rgb;
}

/** Slug dei topic `beneficenza` nell'ordine delle schede: ogni voce e un momento della scena. */
export const beneficenzaOrder = ['rotaract-abbiategrasso', 'mdio-website'] as const;

/** Il primo quartiere e il club, gli altri si accendono sulla scheda del sito. */
export const QUARTERS = [
  { x: -16, z: 3 },
  { x: 0, z: 14 },
  { x: 16, z: 3 },
] as const;
export const CLUB = QUARTERS[0];
export const SITE = { x: 0, z: -13 } as const;

/** Pannello del sito: larghezza, altezza, spessore, quota del centro. */
export const PANEL = { width: 10, height: 6.4, depth: 0.6, y: 4.2 } as const;
/** Blocchi generici della pagina: x, y dal centro del pannello, larghezza, altezza. */
export const BLOCKS: readonly (readonly [number, number, number, number])[] = [
  [-3, -0.7, 2.4, 3.2],
  [0, -0.7, 2.4, 3.2],
  [3, -0.7, 2.4, 3.2],
  [0, 2, 8.4, 0.9],
];
/** Di quanto i blocchi sporgono dal pannello: offset vero, mai facce complanari. */
export const BLOCK_RELIEF = 0.14;

/** Quota delle luci sui tetti e della luce centrale sull'antenna. */
const ROOF_LIGHT = 2.5;
const MAST = 3.1;
const RADIUS = 4.2;
const LIGHTS = 6;
const ARC_SEGMENTS = 10;
const ARC_HEIGHT = 5;

const CELL = 3;
const X0 = -102;
const Z0 = -102;
const NX = 68;
const NZ = 79;
const FADE_FROM = 66;
const FADE_TO = 102;

const sstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Distanza dal punto piu vicino tra quartieri e sito. */
const clearing = (x: number, z: number): number =>
  Math.min(
    ...QUARTERS.map((q) => Math.hypot(x - q.x, z - q.z)),
    Math.hypot(x - SITE.x, z - SITE.z) + 1,
  );

/** Quota del terreno: piano dove ci sono quartieri e sito, colline basse altrove e piu alte in fondo. */
export function heightAt(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.11 + 1) * Math.cos(z * 0.09) * 1.5 + Math.sin(x * 0.05 - z * 0.07) * 1.2;
  const backdrop = sstep(-30, -85, z) * 11 * (0.7 + 0.3 * Math.sin(x * 0.06));
  return (rolling + backdrop) * sstep(9, 17, clearing(x, z));
}

// --- Reti di luci --------------------------------------------------------------------------------

export interface Light {
  position: Vec;
  /** Grandezza della luce. */
  size: number;
  /** Finestra del racconto in cui si accende. */
  from: number;
  to: number;
}

export interface Link {
  a: Vec;
  b: Vec;
  radius: number;
  from: number;
  to: number;
}

/** Luci sui tetti di un quartiere, in cerchio attorno all'antenna. */
export const roofsOf = (q: { x: number; z: number }): { x: number; z: number }[] =>
  Array.from({ length: LIGHTS }, (_, i) => {
    const angle = (i / LIGHTS) * Math.PI * 2 + 0.5;
    const r = RADIUS + (i % 2) * 0.7;
    return { x: q.x + Math.cos(angle) * r, z: q.z + Math.sin(angle) * r };
  });

/** Rete di un quartiere: si chiude tra `start` e `start + 0,6` del racconto. */
function quarter(q: { x: number; z: number }, start: number) {
  const hub: Vec = [q.x, MAST, q.z];
  const roofs = roofsOf(q).map((p): Vec => [p.x, ROOF_LIGHT, p.z]);
  const lights: Light[] = [{ position: hub, size: 0.42, from: start, to: start + 0.1 }];
  const links: Link[] = [];
  roofs.forEach((position, i) => {
    const from = start + i * 0.05;
    const next = roofs[(i + 1) % LIGHTS] as Vec;
    links.push({ a: hub, b: position, radius: 0.07, from, to: from + 0.15 });
    links.push({ a: position, b: next, radius: 0.05, from: from + 0.2, to: from + 0.35 });
    lights.push({ position, size: 0.26, from: from + 0.08, to: from + 0.15 });
  });
  return { lights, links };
}

/** Punto d'arrivo del collegamento `k` sul pannello, sotto il blocco corrispondente. */
const dock = (k: number): Vec => [
  SITE.x + (BLOCKS[k]?.[0] ?? 0),
  PANEL.y - PANEL.height / 2 + 0.3,
  SITE.z + PANEL.depth / 2 + 0.05,
];

/** Arco dall'antenna al pannello, a segmenti: si disegna nell'ordine, in `to - from` del racconto. */
function arc(k: number, from: number, to: number): Link[] {
  const q = QUARTERS[k] as { x: number; z: number };
  const end = dock(k);
  const at = (t: number): Vec => [
    q.x + (end[0] - q.x) * t,
    MAST + (end[1] - MAST) * t + Math.sin(t * Math.PI) * ARC_HEIGHT,
    q.z + (end[2] - q.z) * t,
  ];
  return Array.from({ length: ARC_SEGMENTS }, (_, j) => ({
    a: at(j / ARC_SEGMENTS),
    b: at((j + 1) / ARC_SEGMENTS),
    radius: 0.09,
    from: from + ((to - from) * j) / ARC_SEGMENTS,
    to: from + ((to - from) * (j + 1)) / ARC_SEGMENTS,
  }));
}

/** Finestra in cui il collegamento `k` arriva al sito: i tre arrivano uno dopo l'altro. */
const arcWindow = (k: number): readonly [number, number] => [1.25 + k * 0.05, 1.65 + k * 0.05];

const networks = [quarter(QUARTERS[0], 0.2), quarter(QUARTERS[1], 1.2), quarter(QUARTERS[2], 1.2)];

/** Tutte le luci della scena. */
export const LIGHT_LIST: readonly Light[] = networks.flatMap((n) => n.lights);
/** Tutti i collegamenti: fili dei quartieri e archi verso il sito. */
export const LINK_LIST: readonly Link[] = [
  ...networks.flatMap((n) => n.links),
  ...QUARTERS.flatMap((_, k) => arc(k, ...arcWindow(k))),
];

/** Avanzamento di una finestra del racconto, 0..1, morbido. */
export const reveal = (story: number, from: number, to: number): number =>
  ease((story - from) / (to - from));

/** Quanto e acceso il blocco `k` della pagina: quando arriva il suo arco, l'intestazione per ultima. */
export const blockLit = (story: number, k: number): number => {
  const end = arcWindow(k)[1];
  return reveal(story, end - 0.08, end);
};

// --- Mesh unica ----------------------------------------------------------------------------------

/** Scrive i triangoli nei buffer, ognuno col suo colore. */
function writer() {
  const positions: number[] = [];
  const colors: number[] = [];
  const tri = (a: Vec, b: Vec, c: Vec, color: Rgb): void => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i += 1) colors.push(...color);
  };
  const quad = (a: Vec, b: Vec, c: Vec, d: Vec, color: Rgb): void => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };
  return { positions, colors, tri, quad };
}
type Writer = ReturnType<typeof writer>;

/** Scatola senza fondo, centrata in x/z, base a quota `y`. */
function box(
  w: Writer,
  x: number,
  y: number,
  z: number,
  sx: number,
  h: number,
  sz: number,
  c: Rgb,
) {
  const x0 = x - sx / 2;
  const x1 = x + sx / 2;
  const z0 = z - sz / 2;
  const z1 = z + sz / 2;
  const top = y + h;
  w.quad([x0, y, z1], [x1, y, z1], [x1, top, z1], [x0, top, z1], c);
  w.quad([x1, y, z1], [x1, y, z0], [x1, top, z0], [x1, top, z1], c);
  w.quad([x1, y, z0], [x0, y, z0], [x0, top, z0], [x1, top, z0], c);
  w.quad([x0, y, z0], [x0, y, z1], [x0, top, z1], [x0, top, z0], c);
  w.quad([x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0], c);
}

/** Casa: muri e tetto a due falde che sporge, base sotto il terreno. */
function house(w: Writer, x: number, z: number, wide: number, p: TerritoryPalette) {
  const base = heightAt(x, z) - 0.3;
  const eaves = base + 1.5;
  const ridge = eaves + 0.75;
  const hx = wide / 2;
  const hz = 0.7;
  const over = 0.16;
  const x0 = x - hx - over;
  const x1 = x + hx + over;
  const z0 = z - hz - over;
  const z1 = z + hz + over;
  box(w, x, base, z, wide, 1.5, hz * 2, p.wall);
  w.quad([x0, eaves, z1], [x1, eaves, z1], [x1, ridge, z], [x0, ridge, z], p.roof);
  w.quad([x1, eaves, z0], [x0, eaves, z0], [x0, ridge, z], [x1, ridge, z], p.roof);
  w.tri([x1, eaves, z1], [x1, eaves, z0], [x1, ridge, z], p.wall);
  w.tri([x0, eaves, z0], [x0, eaves, z1], [x0, ridge, z], p.wall);
}

/** Albero: un cono a cinque facce, base sotto il terreno. */
function tree(w: Writer, x: number, z: number, h: number, seed: number, color: Rgb) {
  const y = heightAt(x, z) - 0.2;
  const r = h * 0.34;
  const ring = Array.from({ length: 5 }, (_, i): Vec => {
    const a = (i / 5) * Math.PI * 2 + seed;
    return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
  });
  ring.forEach((p, i) => {
    w.tri(ring[(i + 1) % 5] as Vec, p, [x, y + h, z], color);
  });
}

/** Buffer della mesh unica: terreno, quartieri, alberi e pannello del sito. */
export function territoryBuffers(p: TerritoryPalette) {
  const w = writer();
  // Verso la camera il terreno arriva piu lontano: sullo schermo stretto riempie il fondo.
  const edge = (x: number, z: number): number =>
    sstep(FADE_FROM, FADE_TO, Math.hypot(x, (z - 24) * 0.8));

  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NZ; j += 1) {
      const x0 = X0 + i * CELL;
      const z0 = Z0 + j * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const corner = (x: number, z: number): Vec => [x, heightAt(x, z), z];
      const a = corner(x0, z0);
      const b = corner(x0, z1);
      const c = corner(x1, z1);
      const d = corner(x1, z0);
      const fade = edge(x0 + CELL / 2, z0 + CELL / 2);
      const face = (k: number): Rgb => {
        const base = mixRgb(p.meadow, p.field, hash(i + k * 91, j) * 0.5);
        return mixRgb(base, p.fade, fade);
      };
      w.tri(a, b, c, face(0));
      w.tri(a, c, d, face(1));
    }
  }

  // Sparsi sul territorio: alberi e qualche casa, mai nelle radure di quartieri e sito.
  for (let x = -76; x <= 76; x += 5) {
    for (let z = -70; z <= 120; z += 5) {
      const r = hash(x, z);
      const px = x + (hash(z, x) - 0.5) * 4;
      const pz = z + (hash(x + 3, z) - 0.5) * 4;
      if (clearing(px, pz) < 10 || edge(px, pz) > 0.5) continue;
      if (r > 0.45) tree(w, px, pz, 2 + r * 1.6, r * 6, mixRgb(p.wood, p.fade, edge(px, pz)));
      else if (r < 0.06) house(w, px, pz, 1.8, p);
    }
  }

  QUARTERS.forEach((q, k) => {
    for (const roof of roofsOf(q)) house(w, roof.x, roof.z, 1.9, p);
    box(w, q.x, -0.3, q.z, 0.28, MAST + 0.2, 0.28, p.stone);
    box(w, q.x, -0.3, q.z, 1.2, 0.5, 1.2, p.stone);
    // Il giardino del club: lo stesso teal del Club nella strada dei Lavori.
    const trees = k === 0 ? 11 : 5;
    for (let i = 0; i < trees; i += 1) {
      const angle = (i / trees) * Math.PI * 2 + k;
      const r = 6.6 + hash(i, k) * 1.4;
      const color = k === 0 ? p.garden : p.wood;
      tree(w, q.x + Math.cos(angle) * r, q.z + Math.sin(angle) * r, 2.4, i, color);
    }
  });

  // Pannello del sito su un basamento: ogni solido ha le sue quote, nessuna faccia complanare.
  const plinthTop = PANEL.y - PANEL.height / 2;
  box(w, SITE.x, -0.3, SITE.z, PANEL.width + 2, plinthTop + 0.3, 3, p.stone);
  box(w, SITE.x, plinthTop - 0.1, SITE.z, PANEL.width, PANEL.height + 0.1, PANEL.depth, p.panel);

  return { positions: new Float32Array(w.positions), colors: new Float32Array(w.colors) };
}
