import { describe, expect, it } from 'vitest';
import {
  buildDesk,
  dimAt,
  LINES,
  linesAt,
  logoutAt,
  shotsFor,
} from '../../src/scripts/three/contatti/desk';

const grey = [0.2, 0.2, 0.2] as const;
const palette = {
  wall: grey,
  desk: grey,
  pad: grey,
  body: grey,
  bodyDark: grey,
  key: grey,
  keyAlt: grey,
  mug: grey,
  paper: grey,
};

describe('scrivania dei Contatti', () => {
  it('a scroll fermo su ogni scheda lo schermo e completo', () => {
    expect(linesAt(0)).toBe(1);
    expect(linesAt(1)).toBe(LINES);
    expect(logoutAt(1)).toBe(0);
    expect(dimAt(1)).toBe(0);
    expect(logoutAt(2)).toBe(1);
    expect(dimAt(2)).toBe(1);
  });

  it('il racconto va avanti e indietro senza salti: dipende solo dallo scroll', () => {
    let lines = 0;
    for (let story = 0; story <= 2; story += 0.05) {
      expect(linesAt(story)).toBeGreaterThanOrEqual(lines);
      lines = linesAt(story);
      expect(linesAt(story)).toBe(linesAt(story));
    }
  });

  it('ogni momento ha la sua inquadratura, su schermo largo e stretto', () => {
    for (const portrait of [false, true]) {
      expect(Object.keys(shotsFor(portrait)).sort()).toEqual(['logout', 'overview', 'write']);
    }
  });

  it('la parte ferma e una sola mesh, sotto il budget di una scena low-poly', () => {
    const desk = buildDesk(palette);
    expect(desk.vertices()).toBeGreaterThan(0);
    expect(desk.vertices()).toBeLessThan(5000);
    expect(desk.positions().length).toBe(desk.colors().length);
  });
});
