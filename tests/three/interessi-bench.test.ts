import { describe, expect, it } from 'vitest';
import { cameraAt, fitDistance } from '../../src/scripts/three/framing';
import {
  interessiOrder,
  revealAt,
  shotsFor,
  stationX,
  stopOf,
  WALK_Z,
  walkAt,
} from '../../src/scripts/three/interessi/bench';
import { mesher } from '../../src/scripts/three/interessi/mesher';

const names = ['overview', ...interessiOrder, 'exit'];

describe('banco degli Interessi', () => {
  it('il pinguino e fermo su ogni scheda, accanto al suo oggetto', () => {
    names.forEach((name, i) => {
      const walk = walkAt(names, i);
      expect(walk.between).toBe(false);
      expect(walk.x).toBe(stopOf(name));
    });
    for (let i = 0; i < interessiOrder.length; i += 1) {
      expect(stationX(i) - stopOf(interessiOrder[i] as string)).toBeGreaterThan(0);
    }
  });

  it('la posizione dipende solo dallo scroll e va sempre avanti', () => {
    let last = -Infinity;
    for (let story = 0; story <= names.length - 1; story += 0.05) {
      const { x } = walkAt(names, story);
      expect(x).toBeGreaterThanOrEqual(last);
      expect(x).toBe(walkAt(names, story).x);
      last = x;
    }
  });

  it('cammina solo tra due momenti', () => {
    expect(walkAt(names, 1.1).between).toBe(false);
    expect(walkAt(names, 1.5).between).toBe(true);
  });

  it('ogni gesto e finito sulla sua scheda e parte dal valore dato', () => {
    expect(revealAt(1, 1)).toBe(1);
    expect(revealAt(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(revealAt(5, 1)).toBe(1);
  });

  it('c e un inquadratura per ogni momento', () => {
    for (const portrait of [false, true]) {
      for (const name of names) expect(shotsFor(portrait)[name]).toBeDefined();
    }
  });

  it.each([
    ['desktop', 1440 / 900],
    ['mobile', 390 / 844],
  ])('la camera resta sempre sopra il banco e davanti alla parete (%s)', (_, aspect) => {
    const table = shotsFor(aspect < 1);
    const shots = names.map((n) => table[n] as NonNullable<(typeof table)[string]>);
    const distances = shots.map((s) => fitDistance(s.spanH, s.spanW, aspect, 30));
    for (let story = 0; story <= shots.length - 1; story += 0.02) {
      const { eye } = cameraAt(shots, distances, story);
      expect(eye[1]).toBeGreaterThan(4);
      expect(eye[2]).toBeGreaterThan(WALK_Z);
    }
  });
});

describe('costruttore di solidi', () => {
  it('una scatola ha sei facce e le normali verso l esterno', () => {
    const m = mesher();
    m.box(0, 0, 0, 2, 2, 2, [1, 0, 0]);
    expect(m.vertices()).toBe(36);
    const p = m.positions();
    for (let i = 0; i < 36; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [
        p[(i + k) * 3] as number,
        (p[(i + k) * 3 + 1] as number) - 1,
        p[(i + k) * 3 + 2] as number,
      ]) as [number[], number[], number[]];
      const u = a.map((v, k) => (b[k] as number) - v);
      const w = a.map((v, k) => (c[k] as number) - v);
      const n = [
        (u[1] as number) * (w[2] as number) - (u[2] as number) * (w[1] as number),
        (u[2] as number) * (w[0] as number) - (u[0] as number) * (w[2] as number),
        (u[0] as number) * (w[1] as number) - (u[1] as number) * (w[0] as number),
      ];
      const centre = a.map((v, k) => (v + (b[k] as number) + (c[k] as number)) / 3);
      const outward = n.reduce((sum, v, k) => sum + v * (centre[k] as number), 0);
      expect(outward).toBeGreaterThan(0);
    }
  });
});
