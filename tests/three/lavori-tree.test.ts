import { describe, expect, it } from 'vitest';
import {
  cardFraming,
  fitDistance,
  layoutTree,
  leafIndex,
  type Side,
  STEP,
} from '../../src/scripts/three/lavori/tree';

describe('layoutTree', () => {
  it('cresce in altezza con il numero di foglie', () => {
    const one = layoutTree(['left']);
    const six = layoutTree(['left', 'right', 'left', 'right', 'left', 'right']);
    expect(six.height - one.height).toBeCloseTo(5 * STEP);
  });

  it('mette le foglie in ordine dal basso e dal lato indicato', () => {
    const { branches } = layoutTree(['left', 'right', 'left']);
    expect(branches.map((b) => b.tip.x < 0)).toEqual([true, false, true]);
    expect(branches[0]?.base.y).toBeLessThan(branches[1]?.base.y ?? 0);
    expect(branches[2]?.tip.y).toBeLessThan(layoutTree(['left', 'right', 'left']).height);
  });

  it('regge da 1 a 12 foglie', () => {
    for (let n = 1; n <= 12; n += 1) {
      const sides = Array.from({ length: n }, (_, i): Side => (i % 2 ? 'right' : 'left'));
      expect(layoutTree(sides).branches).toHaveLength(n);
    }
  });
});

describe('leafIndex', () => {
  it('cerca per slug, -1 per i momenti d insieme', () => {
    expect(leafIndex('b', ['a', 'b'])).toBe(1);
    for (const m of ['overview', 'exit', 'boh']) expect(leafIndex(m, ['a', 'b'])).toBe(-1);
  });
});

describe('cardFraming', () => {
  it('su schermo largo sposta l albero dal lato opposto alla scheda', () => {
    expect(cardFraming('right', 1440).shift).toBeLessThan(0);
    expect(cardFraming('left', 1440).shift).toBeGreaterThan(0);
  });
  it('su schermo stretto alza il soggetto', () => {
    expect(cardFraming('right', 390)).toEqual({ shift: 0, lift: expect.any(Number) });
    expect(cardFraming('left', 390).lift).toBeGreaterThan(0);
  });
});

describe('fitDistance', () => {
  it('in verticale vince la larghezza', () => {
    expect(fitDistance(4, 6, 0.5, 35)).toBeGreaterThan(fitDistance(4, 6, 2, 35));
  });
});
