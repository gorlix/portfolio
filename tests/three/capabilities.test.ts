import { describe, expect, it } from 'vitest';
import {
  type CapabilityInput,
  decideTier,
  LOW_BATTERY_LEVEL,
  pixelRatioFor,
  renderProfile,
} from '../../src/scripts/three/capabilities';

const capable: CapabilityInput = {
  webgl: true,
  majorPerformanceCaveat: false,
  reducedMotion: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe('decideTier', () => {
  it('dispositivo capace: scena piena', () => {
    expect(decideTier(capable)).toBe('full');
  });

  it('senza hint di memoria e core (Safari, Firefox): scena piena', () => {
    expect(
      decideTier({ ...capable, deviceMemory: undefined, hardwareConcurrency: undefined }),
    ).toBe('full');
  });

  it('reduced-motion, risparmio dati o WebGL assente: solo testo', () => {
    expect(decideTier({ ...capable, reducedMotion: true })).toBe('text');
    expect(decideTier({ ...capable, saveData: true })).toBe('text');
    expect(decideTier({ ...capable, webgl: false })).toBe('text');
  });

  it('il testo vince sempre sul livello ridotto', () => {
    const weak = { ...capable, deviceMemory: 1, hardwareConcurrency: 1 };
    expect(decideTier({ ...weak, reducedMotion: true })).toBe('text');
    expect(decideTier({ ...weak, saveData: true })).toBe('text');
    expect(decideTier({ ...weak, webgl: false, majorPerformanceCaveat: true })).toBe('text');
  });

  it('micro-scena con reduced-motion: fotogramma statico finale, non testo', () => {
    expect(decideTier({ ...capable, reducedMotion: true }, 'micro')).toBe('reduced');
    expect(decideTier({ ...capable, reducedMotion: true }, 'interactive')).toBe('text');
    // Senza WebGL o con risparmio dati anche la micro-scena lascia solo il testo.
    expect(decideTier({ ...capable, reducedMotion: true, webgl: false }, 'micro')).toBe('text');
    expect(decideTier({ ...capable, saveData: true }, 'micro')).toBe('text');
    expect(decideTier(capable, 'micro')).toBe('full');
  });

  it('dispositivo debole o resa software: scena statica', () => {
    expect(decideTier({ ...capable, deviceMemory: 2 })).toBe('reduced');
    expect(decideTier({ ...capable, deviceMemory: 0.5 })).toBe('reduced');
    expect(decideTier({ ...capable, hardwareConcurrency: 2 })).toBe('reduced');
    expect(decideTier({ ...capable, hardwareConcurrency: 1 })).toBe('reduced');
    expect(decideTier({ ...capable, majorPerformanceCaveat: true })).toBe('reduced');
  });

  it('soglie: sopra 2 GB e sopra 2 core la scena e piena', () => {
    expect(decideTier({ ...capable, deviceMemory: 4, hardwareConcurrency: 4 })).toBe('full');
    expect(decideTier({ ...capable, deviceMemory: 3, hardwareConcurrency: 3 })).toBe('full');
  });

  it('valori non validi (0) non declassano', () => {
    expect(decideTier({ ...capable, deviceMemory: 0, hardwareConcurrency: 0 })).toBe('full');
  });
});

describe('batteria bassa', () => {
  it('batteria scarica e non in carica: scena statica, non testo', () => {
    expect(decideTier({ ...capable, lowBattery: true })).toBe('reduced');
    expect(decideTier({ ...capable, lowBattery: true }, 'micro')).toBe('reduced');
    expect(decideTier({ ...capable, lowBattery: false })).toBe('full');
  });

  it('il testo vince anche sulla batteria bassa', () => {
    expect(decideTier({ ...capable, lowBattery: true, saveData: true })).toBe('text');
    expect(decideTier({ ...capable, lowBattery: true, reducedMotion: true })).toBe('text');
  });

  it('la soglia e una frazione valida', () => {
    expect(LOW_BATTERY_LEVEL).toBeGreaterThan(0);
    expect(LOW_BATTERY_LEVEL).toBeLessThan(0.5);
  });
});

describe('renderProfile', () => {
  it('desktop animato: pixel ratio 2 con antialias', () => {
    expect(renderProfile('full', { coarsePointer: false })).toEqual({
      maxPixelRatio: 2,
      antialias: true,
    });
    expect(renderProfile('full', {})).toEqual({ maxPixelRatio: 2, antialias: true });
  });

  it('telefono animato: pixel ratio 1,5 senza antialias', () => {
    expect(renderProfile('full', { coarsePointer: true })).toEqual({
      maxPixelRatio: 1.5,
      antialias: false,
    });
  });

  it('livello statico: pixel ratio 1 senza antialias, anche su desktop', () => {
    expect(renderProfile('reduced', { coarsePointer: false })).toEqual({
      maxPixelRatio: 1,
      antialias: false,
    });
    expect(renderProfile('reduced', { coarsePointer: true }).maxPixelRatio).toBe(1);
  });

  it('pixelRatioFor limita lo schermo al massimo del profilo', () => {
    const phone = renderProfile('full', { coarsePointer: true });
    expect(pixelRatioFor(phone, 3)).toBe(1.5);
    expect(pixelRatioFor(phone, 1)).toBe(1);
    expect(pixelRatioFor(renderProfile('full', {}), 3)).toBe(2);
  });
});
