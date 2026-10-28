import { describe, expect, it } from 'vitest';
import {
  checkRank,
  greenCount,
  gridOf,
  PAD,
  parseFigures,
  STATIONS,
  series,
  slab,
  stationOf,
} from '../../src/scripts/three/trimind/logic';

const figures = { services: 20, repositories: 4, retentionDays: 15, tests: 490, providers: 3 };

describe('stazioni', () => {
  it('mappa i momenti per nome, la panoramica e gli sconosciuti a -1', () => {
    expect(STATIONS.map((s) => stationOf(s.id))).toEqual([0, 1, 2, 3, 4]);
    expect(stationOf('overview')).toBe(-1);
    expect(stationOf('boh')).toBe(-1);
  });

  it('non si sovrappongono sul piano', () => {
    for (const a of STATIONS)
      for (const b of STATIONS) {
        if (a === b) continue;
        const apart =
          Math.abs(a.x - b.x) >= PAD.width + 0.2 || Math.abs(a.z - b.z) >= PAD.depth + 0.2;
        expect(apart).toBe(true);
      }
  });
});

describe('parseFigures', () => {
  it('accetta le cifre complete e rifiuta quelle mancanti o non intere', () => {
    expect(parseFigures(figures)).toEqual(figures);
    expect(parseFigures(undefined)).toBeNull();
    expect(parseFigures({ ...figures, tests: 0 })).toBeNull();
    expect(parseFigures({ ...figures, services: 2.5 })).toBeNull();
    expect(parseFigures({ services: 1 })).toBeNull();
  });
});

describe('serie simulate', () => {
  it("sono deterministiche e restano nell'intervallo", () => {
    expect(series(3, 24)).toEqual(series(3, 24));
    expect(series(3, 24)).not.toEqual(series(4, 24));
    for (const v of series(9, 200)) {
      expect(v).toBeGreaterThanOrEqual(0.08);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('spunte', () => {
  it("l'ordine e una permutazione con seme", () => {
    const rank = checkRank(490, 11);
    expect([...rank].sort((a, b) => a - b)).toEqual(Array.from({ length: 490 }, (_, i) => i));
    expect(checkRank(490, 11)).toEqual(rank);
  });

  it("quante sono verdi segue l'avanzamento", () => {
    expect(greenCount(490, 0)).toBe(0);
    expect(greenCount(490, 0.5)).toBe(245);
    expect(greenCount(490, 1)).toBe(490);
    expect(greenCount(490, 7)).toBe(490);
    expect(greenCount(490, -1)).toBe(0);
  });

  it('la griglia contiene tutte le spunte', () => {
    const { cols, rows } = gridOf(490);
    expect(cols * rows).toBeGreaterThanOrEqual(490);
    expect(cols).toBeGreaterThan(rows);
  });
});

describe('lastrine di backup', () => {
  it('restano piene entro la retention e svaniscono dopo', () => {
    expect(slab(15, 15).opacity).toBe(1);
    expect(slab(17, 15).opacity).toBeCloseTo(0.5);
    expect(slab(19, 15).opacity).toBe(0);
    expect(slab(40, 15).opacity).toBe(0);
  });

  it('le nuove nascono piccole', () => {
    expect(slab(0, 15).scale).toBe(0);
    expect(slab(0.4, 15).scale).toBeCloseTo(0.4);
    expect(slab(5, 15).scale).toBe(1);
  });
});
