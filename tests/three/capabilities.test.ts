import { describe, expect, it } from 'vitest';
import { type CapabilityInput, decideTier } from '../../src/scripts/three/capabilities';

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
