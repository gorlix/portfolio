import { describe, expect, it } from 'vitest';
import {
  keyAction,
  nextBuffer,
  parseLangCommand,
  rememberedRedirect,
  step,
} from '../../src/scripts/terminal-logic';

const locales = ['it', 'en'] as const;

describe('keyAction', () => {
  it('frecce spostano, cifre scelgono, il resto e ignorato', () => {
    expect(keyAction('ArrowDown', 3)).toEqual({ type: 'move', delta: 1 });
    expect(keyAction('ArrowUp', 3)).toEqual({ type: 'move', delta: -1 });
    expect(keyAction('2', 3)).toEqual({ type: 'pick', index: 1 });
    expect(keyAction('4', 3)).toEqual({ type: 'none' });
    expect(keyAction('0', 3)).toEqual({ type: 'none' });
    expect(keyAction('a', 3)).toEqual({ type: 'none' });
  });
});

describe('step', () => {
  it('gira intorno ai bordi', () => {
    expect(step(2, 1, 3)).toBe(0);
    expect(step(0, -1, 3)).toBe(2);
    expect(step(-1, 1, 3)).toBe(0);
  });
});

describe('parseLangCommand', () => {
  it('lang alterna, lang <codice> sceglie, il resto non e un comando', () => {
    expect(parseLangCommand('lang', 'it', locales)).toBe('en');
    expect(parseLangCommand('  LANG  ', 'en', locales)).toBe('it');
    expect(parseLangCommand('lang en', 'it', locales)).toBe('en');
    expect(parseLangCommand('lang fr', 'it', locales)).toBeNull();
    expect(parseLangCommand('lang en it', 'it', locales)).toBeNull();
    expect(parseLangCommand('language', 'it', locales)).toBeNull();
    expect(parseLangCommand('', 'it', locales)).toBeNull();
  });
});

describe('nextBuffer', () => {
  it('accumula lettere e spazi, si azzera sugli altri tasti, ha un limite', () => {
    expect(nextBuffer(nextBuffer('', 'l'), 'a')).toBe('la');
    expect(nextBuffer('lang', ' ')).toBe('lang ');
    expect(nextBuffer('lang', 'ArrowDown')).toBe('');
    expect(nextBuffer('lang', '1')).toBe('');
    expect(nextBuffer('a'.repeat(16), 'b')).toHaveLength(16);
  });
});

describe('rememberedRedirect', () => {
  it('ripristina la lingua solo dalla radice nella lingua di default', () => {
    expect(rememberedRedirect('en', 'it', 'it', locales)).toBe('en');
    expect(rememberedRedirect('en', 'en', 'it', locales)).toBeNull();
    expect(rememberedRedirect('it', 'it', 'it', locales)).toBeNull();
    expect(rememberedRedirect(null, 'it', 'it', locales)).toBeNull();
    expect(rememberedRedirect('xx', 'it', 'it', locales)).toBeNull();
  });
});
