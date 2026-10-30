import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { microScenes, sceneKind } from '../../src/scripts/three/kinds';
import {
  isSceneName,
  sceneLoaders,
  sceneNames,
  shouldAnimate,
} from '../../src/scripts/three/registry';

describe('registro delle scene', () => {
  it('contiene le scene delle sezioni interattive', () => {
    expect(sceneNames).toEqual([
      'scrivania',
      'homelab',
      'domotica',
      'lavori',
      'trimind',
      'opensource',
      'certificazioni',
      'beneficenza',
      'contatti',
      'interessi',
      'sport',
    ]);
  });

  it('riconosce solo nomi registrati', () => {
    expect(isSceneName('homelab')).toBe(true);
    expect(isSceneName('domotica')).toBe(true);
    expect(isSceneName('placeholder')).toBe(false);
    expect(isSceneName('toString')).toBe(false);
    expect(isSceneName('')).toBe(false);
    expect(isSceneName(undefined)).toBe(false);
  });

  it('ogni caricatore e una funzione pigra', () => {
    for (const loader of Object.values(sceneLoaders)) expect(typeof loader).toBe('function');
  });
});

describe('tipi di scena', () => {
  it('le micro-scene sono registrate, Homelab, Domotica, Lavori, Trimind e Sport immersive', () => {
    for (const name of microScenes) expect(isSceneName(name)).toBe(true);
    expect(sceneKind('lavori')).toBe('immersive');
    expect(sceneKind('trimind')).toBe('immersive');
    expect(sceneKind('sport')).toBe('immersive');
    expect(sceneKind('beneficenza')).toBe('immersive');
    expect(sceneKind('opensource')).toBe('immersive');
    expect(sceneKind('certificazioni')).toBe('immersive');
    expect(sceneKind('interessi')).toBe('micro');
    expect(sceneKind('homelab')).toBe('immersive');
    expect(sceneKind('domotica')).toBe('immersive');
  });
});

describe('shouldAnimate', () => {
  it('anima solo a livello pieno, visibile e scheda in primo piano', () => {
    expect(shouldAnimate('full', true, false)).toBe(true);
    expect(shouldAnimate('full', false, false)).toBe(false);
    expect(shouldAnimate('full', true, true)).toBe(false);
    expect(shouldAnimate('reduced', true, false)).toBe(false);
    expect(shouldAnimate('text', true, false)).toBe(false);
  });
});

// Il bootstrap deve restare piccolo: three solo dietro import() dinamico delle scene, mai statico.
describe('isolamento di three', () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../src/scripts/three/${file}`, import.meta.url), 'utf8');
  const anyThree = /from\s+['"]three['"]|import\(\s*['"]three['"]\s*\)/;

  for (const file of [
    'bootstrap.ts',
    'capabilities.ts',
    'registry.ts',
    'tokens.ts',
    'types.ts',
    'kinds.ts',
    'progress.ts',
    'panel.ts',
    'orbit.ts',
  ]) {
    it(`${file} non importa three`, () => {
      expect(read(file)).not.toMatch(anyThree);
    });
  }

  it('il registro carica le scene solo con import() dinamico', () => {
    const source = read('registry.ts');
    expect(source).toMatch(/import\('\.\/scenes\/homelab'\)/);
    expect(source).not.toMatch(/^import\s[^;]*from\s+['"]\.\/scenes\//m);
  });
});
