import { describe, expect, it } from 'vitest';
import { shotsFor } from '../../src/scripts/three/beneficenza/shots';
import {
  BLOCKS,
  beneficenzaOrder,
  blockLit,
  CLUB,
  heightAt,
  LIGHT_LIST,
  LINK_LIST,
  QUARTERS,
  reveal,
  roofsOf,
  SITE,
  territoryBuffers,
} from '../../src/scripts/three/beneficenza/territory';

const grey = [0.5, 0.5, 0.5] as const;
const palette = {
  meadow: grey,
  field: grey,
  wood: grey,
  garden: grey,
  wall: grey,
  roof: grey,
  stone: grey,
  panel: grey,
  fade: grey,
};
const lit = (story: number) => LIGHT_LIST.filter((l) => reveal(story, l.from, l.to) > 0.99).length;

describe('terreno', () => {
  it('e piano dove stanno quartieri e sito', () => {
    for (const q of [...QUARTERS, SITE]) expect(heightAt(q.x, q.z)).toBeCloseTo(0);
    for (const q of QUARTERS) {
      for (const roof of roofsOf(q)) expect(heightAt(roof.x, roof.z)).toBeCloseTo(0);
    }
  });

  it('i buffer sono triangoli interi, con un colore per vertice', () => {
    const { positions, colors } = territoryBuffers(palette);
    expect(positions.length % 9).toBe(0);
    expect(colors.length).toBe(positions.length);
    expect(positions.every(Number.isFinite)).toBe(true);
  });
});

describe('racconto', () => {
  it('in apertura nessuna luce accesa e nessun collegamento', () => {
    expect(lit(0)).toBe(0);
    expect(LINK_LIST.every((l) => reveal(0, l.from, l.to) === 0)).toBe(true);
  });

  it('sulla scheda del Rotaract e acceso solo il quartiere del club', () => {
    expect(lit(1)).toBe(7);
    const on = LINK_LIST.filter((l) => reveal(1, l.from, l.to) > 0);
    expect(on).toHaveLength(12);
    for (const link of on) {
      expect(Math.hypot(link.a[0] - CLUB.x, link.a[2] - CLUB.z)).toBeLessThan(6);
    }
  });

  it('sulla scheda del sito e tutto collegato e i blocchi sono accesi', () => {
    expect(lit(2)).toBe(LIGHT_LIST.length);
    expect(LINK_LIST.every((l) => reveal(2, l.from, l.to) === 1)).toBe(true);
    BLOCKS.forEach((_, k) => {
      expect(blockLit(2, k)).toBe(1);
      expect(blockLit(1, k)).toBe(0);
    });
  });

  it('ai momenti delle schede la posa e stabile', () => {
    for (const moment of [1, 2]) {
      for (const l of LINK_LIST) {
        expect(reveal(moment - 0.2, l.from, l.to)).toBe(reveal(moment + 0.2, l.from, l.to));
      }
    }
  });

  it('ogni collegamento tocca una sua lunghezza e finisce dove inizia il successivo', () => {
    for (const { a, b } of LINK_LIST)
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0);
  });
});

describe('inquadrature', () => {
  it('ogni momento ha la sua, su schermo largo e stretto', () => {
    for (const portrait of [false, true]) {
      const table = shotsFor(portrait);
      for (const name of ['overview', ...beneficenzaOrder, 'exit']) {
        expect(table[name]).toBeDefined();
      }
    }
  });

  it("su schermo stretto la camera guarda piu dall'alto", () => {
    const steep = (portrait: boolean) => {
      const { from } = shotsFor(portrait).overview as { from: readonly number[] };
      return (from[1] as number) / Math.hypot(from[0] as number, from[2] as number);
    };
    expect(steep(true)).toBeGreaterThan(steep(false));
  });
});
