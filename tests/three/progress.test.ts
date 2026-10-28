import { describe, expect, it } from 'vitest';
import { isOnScreen, pickActive, scrollProgress } from '../../src/scripts/three/progress';

const VIEWPORT = 800;

describe('scrollProgress', () => {
  it('0 quando il riquadro affiora dal fondo, 1 quando il centro arriva al centro', () => {
    expect(scrollProgress({ top: VIEWPORT, height: 300 }, VIEWPORT)).toBe(0);
    expect(scrollProgress({ top: VIEWPORT / 2 - 150, height: 300 }, VIEWPORT)).toBe(1);
  });

  it('cresce con lo scroll e torna indietro tornando su (reversibile)', () => {
    const at = (top: number) => scrollProgress({ top, height: 300 }, VIEWPORT);
    const down = [800, 700, 600, 500, 400, 300].map(at);
    for (let i = 1; i < down.length; i += 1) expect(down[i]).toBeGreaterThan(down[i - 1] as number);
    expect(at(600)).toBe(at(600));
  });

  it('resta tra 0 e 1 prima e dopo', () => {
    expect(scrollProgress({ top: 5000, height: 300 }, VIEWPORT)).toBe(0);
    expect(scrollProgress({ top: -5000, height: 300 }, VIEWPORT)).toBe(1);
  });

  it('misure degeneri: fine scena', () => {
    expect(scrollProgress({ top: 0, height: 0 }, 0)).toBe(1);
  });
});

describe('isOnScreen', () => {
  it('vero solo se il riquadro interseca il viewport', () => {
    expect(isOnScreen({ top: 100, height: 300 }, VIEWPORT)).toBe(true);
    expect(isOnScreen({ top: VIEWPORT, height: 300 }, VIEWPORT)).toBe(false);
    expect(isOnScreen({ top: -300, height: 300 }, VIEWPORT)).toBe(false);
    expect(isOnScreen({ top: -299, height: 300 }, VIEWPORT)).toBe(true);
  });
});

describe('pickActive', () => {
  it('una sola scena attiva: la piu vicina al centro del viewport', () => {
    const boxes = [
      { top: -200, height: 300 },
      { top: 300, height: 300 },
      { top: 700, height: 300 },
    ];
    expect(pickActive(boxes, VIEWPORT)).toBe(1);
  });

  it('ignora i riquadri fuori schermo; -1 se non ce ne sono', () => {
    expect(
      pickActive(
        [
          { top: 2000, height: 300 },
          { top: 600, height: 300 },
        ],
        VIEWPORT,
      ),
    ).toBe(1);
    expect(pickActive([{ top: 2000, height: 300 }], VIEWPORT)).toBe(-1);
    expect(pickActive([], VIEWPORT)).toBe(-1);
  });
});
