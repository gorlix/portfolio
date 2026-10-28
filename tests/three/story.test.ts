import { describe, expect, it } from 'vitest';
import {
  blendAt,
  ease,
  INTERACTIVE_UNTIL,
  isInteractive,
  snapPosition,
  stageOpacity,
  storyPosition,
} from '../../src/scripts/three/story';

const VIEWPORT = 800;
const FOCUS = VIEWPORT / 2;

describe('storyPosition', () => {
  it('0 finche la prima schermata non ha superato la linea di lettura', () => {
    expect(storyPosition([FOCUS + 100, 1500, 2500], FOCUS)).toBe(0);
    expect(storyPosition([FOCUS, 1500], FOCUS)).toBe(0);
  });

  it('i quando la scheda i e al centro, valori intermedi tra una scheda e la successiva', () => {
    // Prima schermata gia passata di 400 px, prima scheda al centro.
    expect(storyPosition([0, FOCUS, FOCUS + 800], FOCUS)).toBe(1);
    expect(storyPosition([-400, 0, 800], FOCUS)).toBeCloseTo(1.5);
    expect(storyPosition([-1200, -800, 0], FOCUS)).toBeCloseTo(1.5 + 0.5 * 0.5 + 0.25, 5);
  });

  it('dopo l ultima scheda resta sull ultimo momento; nessun momento = 0', () => {
    expect(storyPosition([-3000, -2000, -1000], FOCUS)).toBe(2);
    expect(storyPosition([], FOCUS)).toBe(0);
  });

  it('e monotona: scorrendo in giu la posizione non torna mai indietro', () => {
    const base = [400, 1400, 2400, 3400];
    let previous = -1;
    for (let scrolled = 0; scrolled <= 4000; scrolled += 37) {
      const position = storyPosition(
        base.map((c) => c - scrolled),
        FOCUS,
      );
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });
});

describe('blendAt', () => {
  it('fermo sul momento vicino all intero, passaggio al centro del tratto', () => {
    expect(blendAt(1, 4)).toEqual({ from: 1, to: 2, t: 0 });
    expect(blendAt(1.1, 4).t).toBe(0);
    expect(blendAt(1.5, 4).t).toBeCloseTo(0.5);
    expect(blendAt(1.9, 4).t).toBe(1);
  });

  it('agli estremi resta dentro i momenti esistenti', () => {
    expect(blendAt(-2, 4)).toEqual({ from: 0, to: 1, t: 0 });
    expect(blendAt(9, 4)).toEqual({ from: 3, to: 3, t: 0 });
    expect(blendAt(0, 1)).toEqual({ from: 0, to: 0, t: 0 });
  });

  it('il passaggio e continuo e crescente', () => {
    let previous = -1;
    for (let p = 2; p < 3; p += 0.01) {
      const { t } = blendAt(p, 5);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });
});

describe('ease, snap e interattivita', () => {
  it('ease parte e arriva fermo, limitato a 0..1', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
  });

  it('livello statico: il momento piu vicino', () => {
    expect(snapPosition(0.3)).toBe(0);
    expect(snapPosition(1.6)).toBe(2);
    expect(snapPosition(-0.4)).toBe(0);
  });

  it('3D usabile solo nella prima schermata', () => {
    expect(isInteractive(0)).toBe(true);
    expect(isInteractive(INTERACTIVE_UNTIL - 0.01)).toBe(true);
    expect(isInteractive(INTERACTIVE_UNTIL)).toBe(false);
    expect(isInteractive(2)).toBe(false);
  });
});

describe('stageOpacity', () => {
  it('piena mentre la sezione copre il viewport', () => {
    expect(stageOpacity(0, 5000, VIEWPORT)).toBe(1);
    expect(stageOpacity(-3000, 2000, VIEWPORT)).toBe(1);
  });

  it('entra mentre la sezione sale ed esce sul finale', () => {
    expect(stageOpacity(VIEWPORT, 9000, VIEWPORT)).toBe(0);
    expect(stageOpacity(VIEWPORT * 0.75, 9000, VIEWPORT)).toBeCloseTo(0.5);
    expect(stageOpacity(-9000, VIEWPORT * 0.25, VIEWPORT)).toBe(0);
    expect(stageOpacity(-9000, VIEWPORT * 0.625, VIEWPORT)).toBeCloseTo(0.5);
  });
});
