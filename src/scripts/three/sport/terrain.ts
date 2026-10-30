import type { Point } from './course';

/*
 * Montagna di Sport (PORT-88). Logica PURA, senza three: altezza del terreno e buffer della mesh
 * unica colorata per faccia. PROVVISORIO: forme da rifinire.
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

export const TENNIS: Court = { x: 20, z: 12, length: 10, width: 5 };
export const VOLLEY: Court = { x: 20, z: 3, length: 8, width: 4 };

const bump = (x: number, z: number, rx: number, rz: number): number => {
  const d = Math.hypot(x / rx, z / rz);
  return d < 1 ? (1 - d * d) ** 2 : 0;
};

export function heightAt(x: number, z: number): number {
  return 9 * bump(x, z + 6, 24, 16) + 6 * bump(x, z + 6, 9, 8);
}

export const PISTE: readonly Point[] = Array.from({ length: 80 }, (_, i) => {
  const t = i / 79;
  return { x: Math.sin(t * Math.PI * 5) * (1 + 2 * t), z: -3 + t * 17 };
});

export const TRAIL: readonly Point[] = Array.from({ length: 60 }, (_, i) => {
  const t = i / 59;
  return { x: -10 - 9 * t + Math.sin(t * Math.PI * 4) * 2, z: 14 - 15 * t };
});

export function terrainBuffers(palette: TerrainPalette): {
  positions: Float32Array;
  colors: Float32Array;
} {
  const positions: number[] = [];
  const colors: number[] = [];
  const size = 1.2;
  for (let x = -54; x < 54; x += size) {
    for (let z = -24; z < 30; z += size) {
      const quad = [
        [x, z],
        [x, z + size],
        [x + size, z],
        [x + size, z],
        [x, z + size],
        [x + size, z + size],
      ] as const;
      for (let k = 0; k < 6; k += 3) {
        const tri = [quad[k], quad[k + 1], quad[k + 2]] as const;
        let top = 0;
        for (const p of tri) {
          if (!p) continue;
          const y = heightAt(p[0], p[1]);
          top += y / 3;
          positions.push(p[0], y, p[1]);
        }
        const c = top > 7 ? palette.snow : top > 3 ? palette.rock : palette.meadow;
        for (let v = 0; v < 3; v += 1) colors.push(...c);
      }
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}
