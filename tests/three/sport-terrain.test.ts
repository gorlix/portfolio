import { describe, expect, it } from 'vitest';
import {
  GRID,
  heightAt,
  PISTE,
  type Rgb,
  TENNIS,
  type TerrainPalette,
  TRAIL,
  terrainBuffers,
  VOLLEY,
} from '../../src/scripts/three/sport/terrain';

const names = [
  'snow',
  'ice',
  'rock',
  'meadow',
  'forest',
  'soil',
  'clay',
  'court',
  'line',
  'wood',
  'roof',
] as const;
/** Palette di prova: ogni voce ha un colore diverso, cosi si riconosce da dove viene. */
const palette = Object.fromEntries(
  names.map((name, i) => [name, [(i + 1) / 16, 0.25, 0.75] as Rgb]),
) as unknown as TerrainPalette;
const { positions, colors } = terrainBuffers(palette);
/** Vertici del terreno: sono i primi del buffer, due triangoli per cella. */
const groundVertices = GRID.nx * GRID.nz * 6;

const pathSteps = (path: readonly { x: number; z: number }[]) =>
  path.slice(1).map((p, i) => {
    const a = path[i] as { x: number; z: number };
    return { ds: Math.hypot(p.x - a.x, p.z - a.z), dh: heightAt(p.x, p.z) - heightAt(a.x, a.z) };
  });

type Pt = { x: number; z: number };
/** Curva piu stretta del percorso: massimo cambio di direzione tra due passi (radianti). */
const sharpest = (path: readonly Pt[]): number => {
  let worst = 0;
  for (let i = 2; i < path.length; i += 1) {
    const [a, b, c] = [path[i - 2], path[i - 1], path[i]] as [Pt, Pt, Pt];
    const turn = Math.abs(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z));
    worst = Math.max(worst, Math.min(turn, 2 * Math.PI - turn));
  }
  return worst;
};

describe('terrainBuffers', () => {
  it('tre vertici per faccia, nove numeri per triangolo, senza NaN', () => {
    expect(positions.length % 9).toBe(0);
    expect(colors.length).toBe(positions.length);
    expect(positions.length / 3).toBeLessThan(120_000);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(colors.every(Number.isFinite)).toBe(true);
  });

  it('usa solo colori della palette, uno per faccia', () => {
    const expected = new Set(
      (Object.values(palette) as Rgb[]).map((c) => c.map((n) => Math.fround(n)).join(',')),
    );
    for (let t = 0; t < colors.length; t += 9) {
      const face = Array.from(colors.slice(t, t + 9));
      expect(expected.has(face.slice(0, 3).join(','))).toBe(true);
      expect(face.slice(3, 6)).toEqual(face.slice(0, 3));
      expect(face.slice(6, 9)).toEqual(face.slice(0, 3));
    }
  });

  it('e deterministico', () => {
    const again = terrainBuffers(palette);
    expect(again.positions).toEqual(positions);
    expect(again.colors).toEqual(colors);
  });
});

describe('heightAt', () => {
  it('coincide con i vertici della griglia', () => {
    for (let v = 0; v < groundVertices; v += 1) {
      const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]] as number[];
      expect(Number.isInteger(x) && Number.isInteger(z)).toBe(true);
      expect(heightAt(x as number, z as number)).toBeCloseTo(y as number, 4);
    }
  });

  it('e esattamente la superficie triangolata: sul baricentro di ogni faccia', () => {
    for (let t = 0; t < groundVertices; t += 9 * 7) {
      const p = (k: number, axis: number) => positions[t + k * 3 + axis] as number;
      const mean = (axis: number) => (p(0, axis) + p(1, axis) + p(2, axis)) / 3;
      expect(heightAt(mean(0), mean(2))).toBeCloseTo(mean(1), 4);
    }
  });

  it('fuori dalla griglia resta finita', () => {
    for (const [x, z] of [
      [-500, 0],
      [500, 0],
      [0, -500],
      [0, 500],
    ] as const) {
      expect(Number.isFinite(heightAt(x, z))).toBe(true);
    }
  });

  it('la montagna e alta e larga come da progetto', () => {
    let top = 0;
    let left = 0;
    let right = 0;
    for (let x = -40; x <= 40; x += 1) {
      for (let z = -25; z <= 20; z += 1) {
        const y = heightAt(x, z);
        top = Math.max(top, y);
        if (y > 4 && x < left) left = x;
        if (y > 4 && x > right) right = x;
      }
    }
    expect(top).toBeGreaterThan(15);
    expect(top).toBeLessThan(19);
    expect(right - left).toBeGreaterThan(40);
  });
});

describe('pista', () => {
  it('scende sempre, da dentro la montagna al prato', () => {
    const steps = pathSteps(PISTE);
    for (const { dh } of steps) expect(dh).toBeLessThan(0.05);
    expect(heightAt(PISTE[0]?.x ?? 0, PISTE[0]?.z ?? 0)).toBeGreaterThan(8);
    const end = PISTE[PISTE.length - 1];
    expect(heightAt(end?.x ?? 0, end?.z ?? 0)).toBeLessThan(0.6);
  });

  it('ha pendenza regolare e curve larghe', () => {
    const steps = pathSteps(PISTE);
    const total = steps.reduce((sum, s) => sum + s.ds, 0);
    expect(total).toBeGreaterThan(22);
    for (const { ds, dh } of steps) expect(-dh / ds).toBeLessThan(0.8);
    expect(sharpest(PISTE)).toBeLessThan(0.3);
  });
});

describe('sentiero', () => {
  it('sale dal prato alla sella con pendenza dolce', () => {
    const steps = pathSteps(TRAIL);
    for (const { ds, dh } of steps) expect(dh / ds).toBeLessThan(Math.tan((20 * Math.PI) / 180));
    for (const { dh } of steps) expect(dh).toBeGreaterThan(-0.05);
    const first = TRAIL[0];
    const last = TRAIL[TRAIL.length - 1];
    expect(heightAt(first?.x ?? 0, first?.z ?? 0)).toBeLessThan(1);
    expect(heightAt(last?.x ?? 0, last?.z ?? 0)).toBeGreaterThan(5);
  });

  it('e lungo 30-45 unita, a tornanti larghi (nessun gomito stretto)', () => {
    const total = pathSteps(TRAIL).reduce((sum, s) => sum + s.ds, 0);
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(45);
    expect(sharpest(TRAIL)).toBeLessThan(0.35);
  });
});

describe('campi', () => {
  it('stanno a destra, su un ripiano a quota 0', () => {
    for (const court of [TENNIS, VOLLEY]) {
      expect(court.x - court.length / 2).toBeGreaterThan(0);
      for (let u = -1; u <= 1; u += 0.25) {
        for (let v = -1; v <= 1; v += 0.25) {
          const x = court.x + (u * court.length) / 2;
          const z = court.z + (v * court.width) / 2;
          expect(heightAt(x, z)).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('non si sovrappongono e hanno l asse lungo su X', () => {
    expect(TENNIS.length).toBeGreaterThan(TENNIS.width);
    expect(VOLLEY.length).toBeGreaterThan(VOLLEY.width);
    const gap = Math.abs(TENNIS.z - VOLLEY.z) - (TENNIS.width + VOLLEY.width) / 2;
    expect(gap).toBeGreaterThan(1);
  });

  it('niente sporge dal ripiano a quota 0: righe e reti sono solidi alzati di almeno 0,03', () => {
    const lowest = new Set<number>();
    for (let v = groundVertices; v < positions.length; v += 3) {
      const [x, y, z] = [positions[v], positions[v + 1], positions[v + 2]] as number[];
      const onCourt =
        Math.abs((x as number) - TENNIS.x) < TENNIS.length / 2 &&
        Math.abs((z as number) - TENNIS.z) < TENNIS.width / 2;
      if (onCourt && (y as number) > 0) lowest.add(Math.round((y as number) * 1000));
    }
    expect(Math.min(...lowest)).toBeGreaterThanOrEqual(30);
  });
});

describe('alberi e rifugi', () => {
  it('non toccano la pista ne il sentiero (tranne i rifugi alle estremita)', () => {
    const ends = [PISTE[0], PISTE[PISTE.length - 1], TRAIL[TRAIL.length - 1]] as {
      x: number;
      z: number;
    }[];
    for (let v = groundVertices; v < positions.length; v += 3) {
      const [x, y, z] = [positions[v], positions[v + 1], positions[v + 2]] as number[];
      if ((y as number) - heightAt(x as number, z as number) < 0.5) continue;
      if (ends.some((e) => Math.hypot(e.x - (x as number), e.z - (z as number)) < 5)) continue;
      const dist = (path: readonly { x: number; z: number }[]) =>
        Math.min(...path.map((p) => Math.hypot(p.x - (x as number), p.z - (z as number))));
      expect(dist(PISTE)).toBeGreaterThan(2);
      expect(dist(TRAIL)).toBeGreaterThan(1.5);
    }
  });
});
