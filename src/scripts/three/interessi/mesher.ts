/*
 * Costruttore di solidi colorati faccia per faccia (PORT-92): molti pezzi, una sola mesh. Senza
 * indici, ogni faccia ha i suoi vertici e il suo colore; niente normali, le ricava il flatShading.
 * Logica pura, senza three.
 */

export type Rgb = readonly [number, number, number];
type Vec = readonly [number, number, number];

/** Posa di un pezzo: prima gira attorno a Z, poi X, poi Y, poi si sposta. */
export interface Frame {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Anello di un solido di rotazione: raggio e quota. */
export type Ring = readonly [number, number];
/** Colore unico o una tinta scelta faccia per faccia. */
type Tint = Rgb | ((face: number) => Rgb);

export interface Mesher {
  /** Scatola `w` x `h` x `d`; `y` e la quota della base, x e z il centro. */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tint: Tint,
    f?: Frame,
  ): void;
  /** Solido di rotazione attorno a Y; `n` lati. I raggi sporgono di `wobble(i)` a ogni lato. */
  lathe(
    rings: readonly Ring[],
    n: number,
    tint: Tint,
    f?: Frame,
    wobble?: (i: number) => number,
  ): void;
  /** Profilo chiuso nel piano XY, estruso lungo Z tra -depth/2 e depth/2. */
  extrude(
    outline: readonly (readonly [number, number])[],
    depth: number,
    tint: Tint,
    f?: Frame,
  ): void;
  /** Vertici scritti finora. */
  vertices(): number;
  positions(): Float32Array;
  colors(): Float32Array;
}

const place = ({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 }: Frame) => {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(ry),
    Math.sin(ry),
    Math.cos(rz),
    Math.sin(rz),
  ];
  return ([px, py, pz]: Vec): Vec => {
    const ax = px * cz - py * sz;
    const ay = px * sz + py * cz;
    const by = ay * cx - pz * sx;
    const bz = ay * sx + pz * cx;
    return [ax * cy + bz * sy + x, by + y, -ax * sy + bz * cy + z];
  };
};

export function mesher(): Mesher {
  const position: number[] = [];
  const color: number[] = [];
  let faces = 0;
  const pick = (tint: Tint): Rgb => (typeof tint === 'function' ? tint(faces) : tint);
  const tri = (a: Vec, b: Vec, c: Vec, rgb: Rgb): void => {
    position.push(...a, ...b, ...c);
    color.push(...rgb, ...rgb, ...rgb);
  };
  const quad = (a: Vec, b: Vec, c: Vec, d: Vec, tint: Tint): void => {
    const rgb = pick(tint);
    faces += 1;
    tri(a, b, c, rgb);
    tri(a, c, d, rgb);
  };

  return {
    box(x, y, z, w, h, d, tint, f = {}) {
      const to = place(f);
      const [x0, x1] = [x - w / 2, x + w / 2];
      const [y0, y1] = [y, y + h];
      const [z0, z1] = [z - d / 2, z + d / 2];
      const p = (px: number, py: number, pz: number) => to([px, py, pz]);
      quad(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), tint);
      quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), tint);
      quad(p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0), tint);
      quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), tint);
      quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), tint);
      quad(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), tint);
    },
    lathe(rings, n, tint, f = {}, wobble = () => 1) {
      const to = place(f);
      const at = (r: number, y: number, i: number): Vec => {
        const k = r * wobble(i % n);
        const angle = (i * Math.PI * 2) / n;
        return to([Math.cos(angle) * k, y, Math.sin(angle) * k]);
      };
      for (let s = 0; s + 1 < rings.length; s += 1) {
        const [r0, y0] = rings[s] as Ring;
        const [r1, y1] = rings[s + 1] as Ring;
        for (let i = 0; i < n; i += 1) {
          quad(at(r0, y0, i + 1), at(r0, y0, i), at(r1, y1, i), at(r1, y1, i + 1), tint);
        }
      }
      const [r0, y0] = rings[0] as Ring;
      const [r1, y1] = rings[rings.length - 1] as Ring;
      for (let i = 0; i < n; i += 1) {
        if (r1 > 0) tri(to([0, y1, 0]), at(r1, y1, i + 1), at(r1, y1, i), pick(tint));
        if (r0 > 0) tri(to([0, y0, 0]), at(r0, y0, i), at(r0, y0, i + 1), pick(tint));
      }
    },
    extrude(outline, depth, tint, f = {}) {
      const to = place(f);
      const z = depth / 2;
      const count = outline.length;
      for (let i = 0; i < count; i += 1) {
        const [ax, ay] = outline[i] as readonly [number, number];
        const [bx, by] = outline[(i + 1) % count] as readonly [number, number];
        quad(to([ax, ay, -z]), to([bx, by, -z]), to([bx, by, z]), to([ax, ay, z]), tint);
        const rgb = pick(tint);
        tri(to([0, 0, z]), to([ax, ay, z]), to([bx, by, z]), rgb);
        tri(to([0, 0, -z]), to([bx, by, -z]), to([ax, ay, -z]), rgb);
      }
    },
    vertices: () => position.length / 3,
    positions: () => new Float32Array(position),
    colors: () => new Float32Array(color),
  };
}
