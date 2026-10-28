import { describe, expect, it } from 'vitest';
import {
  createDomoticaSim,
  HISTORY,
  sparkPoints,
  TREND_THRESHOLD,
  trendOf,
} from '../../src/scripts/three/domotica/sim';

const ROOMS = ['camera', 'studio', 'soggiorno', 'cucina'];

describe('createDomoticaSim', () => {
  it('stesso seme, stessi valori', () => {
    const a = createDomoticaSim(ROOMS, 7);
    const b = createDomoticaSim(ROOMS, 7);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.tick()).toEqual(b.tick());
  });

  it('valori domestici plausibili anche dopo tanti passi', () => {
    const sim = createDomoticaSim(ROOMS, 42);
    for (let i = 0; i < 2000; i += 1) {
      const s = sim.tick();
      for (const id of ROOMS) {
        const room = s.rooms[id];
        expect(room?.temperature).toBeGreaterThanOrEqual(19);
        expect(room?.temperature).toBeLessThanOrEqual(23);
        expect(room?.humidity).toBeGreaterThanOrEqual(40);
        expect(room?.humidity).toBeLessThanOrEqual(60);
      }
      expect(s.air.co2).toBeGreaterThanOrEqual(420);
      expect(s.air.co2).toBeLessThanOrEqual(1100);
      expect(s.weather.pressure).toBeGreaterThanOrEqual(995);
      expect(s.weather.pressure).toBeLessThanOrEqual(1032);
      expect(s.pressureHistory).toHaveLength(HISTORY);
    }
  });
});

describe('trendOf', () => {
  const flat = Array.from({ length: HISTORY }, () => 1013);
  it('stabile sotto la soglia, in calo o in aumento oltre', () => {
    expect(trendOf(flat)).toBe('steady');
    expect(trendOf([...flat.slice(1), 1013 - TREND_THRESHOLD])).toBe('falling');
    expect(trendOf([...flat.slice(1), 1013 + TREND_THRESHOLD])).toBe('rising');
    expect(trendOf([])).toBe('steady');
  });
});

describe('sparkPoints', () => {
  it('dal minimo in basso al massimo in alto, su tutta la larghezza', () => {
    expect(sparkPoints([1, 2, 3])).toBe('0,16 30,8 60,0');
    expect(sparkPoints([])).toBe('');
  });
});
