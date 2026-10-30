import { describe, expect, it } from 'vitest';
import { fitDistance } from '../../src/scripts/three/framing';
import {
  cameraAt,
  climbAt,
  descentAt,
  rallyAt,
  ribbon,
  SKI_PERIOD,
  STILL_TIME,
  sportOrder,
  TENNIS_SHOT,
  tennisBallY,
  track,
  trackAt,
  VOLLEY_SHOT,
  volleyBallY,
} from '../../src/scripts/three/sport/course';
import { shotsFor } from '../../src/scripts/three/sport/shots';
import { heightAt } from '../../src/scripts/three/sport/terrain';

const names = ['overview', ...sportOrder, 'exit'];

describe('percorsi', () => {
  const path = track([
    { x: 0, z: 0 },
    { x: 0, z: 3 },
    { x: 4, z: 3 },
  ]);

  it('misura la lunghezza e trova il punto a una frazione', () => {
    expect(path.total).toBe(7);
    expect(trackAt(path, 3 / 7)).toMatchObject({ x: 0, z: 3 });
    expect(trackAt(path, 5 / 7).x).toBeCloseTo(2);
  });

  it('il fronte guarda nel verso del percorso e fuori intervallo resta agli estremi', () => {
    expect(trackAt(path, 0.1).heading).toBeCloseTo(0);
    expect(trackAt(path, 0.9).heading).toBeCloseTo(Math.PI / 2);
    expect(trackAt(path, 2)).toMatchObject({ x: 4, z: 3 });
    expect(trackAt(path, -1)).toMatchObject({ x: 0, z: 0 });
  });

  it('la striscia sta sopra il terreno di un offset reale', () => {
    const out = ribbon(path.points, 0.5, 0.07, () => 2);
    expect(out).toHaveLength(36);
    for (let i = 1; i < out.length; i += 3) expect(out[i]).toBeCloseTo(2.07);
  });
});

describe('cicli d ambiente', () => {
  it('lo sciatore scende, poi la traccia si scioglie e il ciclo riparte', () => {
    expect(descentAt(0)).toEqual({ run: 0, melted: 0 });
    expect(descentAt(SKI_PERIOD * 0.43).run).toBeCloseTo(0.5);
    expect(descentAt(SKI_PERIOD * 0.93)).toMatchObject({ run: 1 });
    expect(descentAt(SKI_PERIOD * 0.93).melted).toBeCloseTo(0.5);
    expect(descentAt(SKI_PERIOD)).toEqual({ run: 0, melted: 0 });
  });

  it('la palla parte dal giocatore 0, arriva all 1 e torna indietro senza salti', () => {
    expect(rallyAt(0, 2).along).toBeCloseTo(-1);
    expect(rallyAt(2, 2).along).toBeCloseTo(1);
    expect(rallyAt(4, 2).along).toBeCloseTo(-1);
    expect(rallyAt(0, 2).swing[0]).toBe(1);
    expect(rallyAt(2, 2).swing[1]).toBe(1);
    expect(rallyAt(1, 2).swing).toEqual([0, 0]);
  });

  it('la pallina tocca terra al rimbalzo e passa sopra la rete', () => {
    expect(tennisBallY(0.7, 0.75)).toBeCloseTo(0.06, 2);
    expect(tennisBallY(0.5, 0.75)).toBeGreaterThan(0.9);
    expect(tennisBallY(0, 0.75)).toBeCloseTo(0.81);
  });

  it('il pallone parte e arriva al contatto del bagher', () => {
    expect(volleyBallY(0, 0.55, 3)).toBeCloseTo(0.55);
    expect(volleyBallY(1, 0.55, 3)).toBeCloseTo(0.55);
    expect(volleyBallY(0.5, 0.55, 3)).toBeCloseTo(3);
  });

  it('il fotogramma fermo ha sciatore a meta pista e palle in volo', () => {
    expect(descentAt(STILL_TIME).run).toBeGreaterThan(0.4);
    expect(descentAt(STILL_TIME).run).toBeLessThan(0.8);
    for (const period of [TENNIS_SHOT, VOLLEY_SHOT]) {
      expect(rallyAt(STILL_TIME, period).swing).toEqual([0, 0]);
    }
  });
});

describe('escursionisti', () => {
  it('avanzano con lo scroll, a meta sentiero sulla loro scheda, fermi prima e dopo', () => {
    expect(climbAt(0, 2)).toBe(0);
    expect(climbAt(1, 2)).toBe(0);
    expect(climbAt(2, 2)).toBe(0.5);
    expect(climbAt(3, 2)).toBe(1);
    expect(climbAt(5, 2)).toBe(1);
  });
});

describe('inquadrature', () => {
  it('c e un inquadratura per ogni momento', () => {
    for (const portrait of [false, true]) {
      for (const name of names) expect(shotsFor(portrait)[name]).toBeDefined();
    }
  });

  it.each([
    ['desktop', 1440 / 900],
    ['mobile', 390 / 844],
  ])('la camera non attraversa mai la montagna (%s)', (_, aspect) => {
    const table = shotsFor(aspect < 1);
    const shots = names.map((n) => table[n] as NonNullable<(typeof table)[string]>);
    const distances = shots.map((s) => fitDistance(s.spanH, s.spanW, aspect, 30));
    for (let story = 0; story <= shots.length - 1; story += 0.02) {
      const { eye } = cameraAt(shots, distances, story);
      expect(eye[1]).toBeGreaterThan(heightAt(eye[0], eye[2]) + 2);
    }
  });
});
