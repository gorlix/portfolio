import { describe, expect, it } from 'vitest';
import { phase, staggered } from '../../src/scripts/three/phases';

describe('phase', () => {
  it('limita a 0..1 e interpola nella finestra', () => {
    expect(phase(0, 0.2, 0.6)).toBe(0);
    expect(phase(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(phase(1, 0.2, 0.6)).toBe(1);
  });
});

describe('staggered', () => {
  it('a fine avanzamento tutti gli elementi sono completi', () => {
    for (const count of [1, 3, 5]) {
      for (let i = 0; i < count; i++) expect(staggered(1, i, count)).toBe(1);
    }
  });

  it('a inizio avanzamento nessuno e comparso', () => {
    for (let i = 0; i < 4; i++) expect(staggered(0, i, 4)).toBe(0);
  });

  it('compaiono in ordine e in modo monotono', () => {
    const at = 0.4;
    const values = [0, 1, 2, 3].map((i) => staggered(at, i, 4));
    for (let i = 1; i < values.length; i++)
      expect(values[i] ?? 0).toBeLessThanOrEqual(values[i - 1] ?? 0);
    expect(staggered(0.3, 1, 4)).toBeLessThanOrEqual(staggered(0.5, 1, 4));
  });

  it('tollera count zero', () => {
    expect(staggered(1, 0, 0)).toBe(1);
  });
});
