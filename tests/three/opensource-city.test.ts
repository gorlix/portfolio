import { describe, expect, it } from 'vitest';
import {
  buildCity,
  buildingHeight,
  COLUMN,
  HEIGHT,
  PLOT,
  walkerAt,
} from '../../src/scripts/three/opensource/city';

const districts = [
  { id: 'a', stars: [10, 0, 2000, 3, 1] },
  { id: 'b', stars: [0] },
  { id: 'c', stars: [5, 5] },
];

describe('citta dei repository', () => {
  it('un edificio per repository, piu alto con piu stelle, entro il massimo', () => {
    const city = buildCity(districts);
    expect(city.buildings).toHaveLength(8);
    expect(buildingHeight(0)).toBe(HEIGHT.base);
    expect(buildingHeight(10)).toBeGreaterThan(buildingHeight(1));
    expect(buildingHeight(1_000_000)).toBe(HEIGHT.max);
    const a = city.buildings.filter((b) => b.district === 0);
    const top = a.reduce((x, y) => (y.height > x.height ? y : x));
    expect(top.repo).toBe(2);
  });

  it('nessun edificio tocca o sovrasta un altro della stessa fila, tutti nel loro quartiere', () => {
    const city = buildCity(districts);
    for (const b of city.buildings) {
      const block = city.blocks[b.district];
      expect(b.x - b.width / 2).toBeGreaterThan(block?.x0 ?? Number.NaN);
      expect(b.x + b.width / 2).toBeLessThan(block?.x1 ?? Number.NaN);
      for (const o of city.buildings) {
        if (o !== b && o.z === b.z) expect(Math.abs(o.x - b.x)).toBeGreaterThan(PLOT.width);
      }
    }
    expect(COLUMN).toBeGreaterThan(PLOT.width);
  });

  it('i quartieri non si sovrappongono e il pinguino si ferma in ognuno', () => {
    const city = buildCity(districts);
    expect(city.stops).toHaveLength(districts.length + 2);
    city.blocks.forEach((block, i) => {
      const next = city.blocks[i + 1];
      if (next) expect(next.x0).toBeGreaterThan(block.x1);
      const stop = city.stops[i + 1] as number;
      expect(stop).toBeGreaterThan(block.x0);
      expect(stop).toBeLessThan(block.x1);
    });
  });

  it('fermo a ogni momento, cammina in mezzo, sempre in avanti, saluta alla fine', () => {
    const city = buildCity(districts);
    city.stops.slice(0, -1).forEach((stop, i) => {
      expect(walkerAt(city, i)).toMatchObject({ x: stop, pose: 'stand' });
    });
    expect(walkerAt(city, 0.5).pose).toBe('run');
    const last = city.stops.length - 1;
    expect(walkerAt(city, last)).toMatchObject({ x: city.stops[last], pose: 'wave' });
    let x = -Infinity;
    for (let s = 0; s <= last; s += 0.01) {
      const at = walkerAt(city, s).x;
      expect(at).toBeGreaterThanOrEqual(x);
      x = at;
    }
  });
});
