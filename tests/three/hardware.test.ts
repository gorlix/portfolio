import { describe, expect, it } from 'vitest';
import { placePopup } from '../../src/scripts/three/hardware';

const size = { width: 200, height: 100 };
const bounds = { width: 1000, height: 600 };

describe('placePopup', () => {
  it('sta sopra il punto, centrato', () => {
    expect(placePopup({ x: 500, y: 300 }, size, bounds)).toEqual({ left: 400, top: 196 });
  });
  it('va sotto se sopra non c e posto', () => {
    expect(placePopup({ x: 500, y: 60 }, size, bounds).top).toBe(64);
  });
  it('resta dentro i margini a destra e a sinistra', () => {
    expect(placePopup({ x: 990, y: 300 }, size, bounds).left).toBe(792);
    expect(placePopup({ x: 0, y: 300 }, size, bounds).left).toBe(8);
  });
  it('non esce in basso', () => {
    expect(placePopup({ x: 500, y: 20 }, size, { width: 1000, height: 120 }).top).toBe(12);
  });
});
