/*
 * Logica pura del terminale d'ingresso (nessun DOM): testabile con Vitest.
 * Il collegamento al DOM sta in `terminal.ts`.
 */

export type KeyAction =
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'pick'; index: number }
  | { type: 'none' };

/** Frecce su/giu spostano la selezione; 1..n aprono la scelta corrispondente. */
export function keyAction(key: string, choices: number): KeyAction {
  if (key === 'ArrowDown') return { type: 'move', delta: 1 };
  if (key === 'ArrowUp') return { type: 'move', delta: -1 };
  if (/^[1-9]$/.test(key) && Number(key) <= choices)
    return { type: 'pick', index: Number(key) - 1 };
  return { type: 'none' };
}

/** Indice successivo con giro completo. */
export const step = (current: number, delta: number, length: number): number =>
  (((current + delta) % length) + length) % length;

/**
 * Interpreta la riga digitata: `lang` alterna la lingua, `lang it` / `lang en` ne sceglie una.
 * Restituisce la lingua di destinazione, o `null` se non e un comando valido.
 */
export function parseLangCommand<L extends string>(
  line: string,
  current: L,
  locales: readonly L[],
): L | null {
  const [cmd, arg, ...rest] = line.trim().toLowerCase().split(/\s+/);
  if (cmd !== 'lang' || rest.length > 0) return null;
  if (arg === undefined) return locales.find((l) => l !== current) ?? null;
  return locales.find((l) => l === arg) ?? null;
}

/** Lettere e spazio entrano nel buffer del comando; qualsiasi altro tasto lo azzera. */
export function nextBuffer(buffer: string, key: string): string {
  if (key.length === 1 && /[a-zA-Z ]/.test(key)) return (buffer + key).slice(-16);
  return '';
}

/** Lingua da ripristinare dalla preferenza salvata, solo dalla radice nella lingua di default. */
export function rememberedRedirect<L extends string>(
  stored: string | null,
  current: L,
  defaultLocale: L,
  locales: readonly L[],
): L | null {
  if (current !== defaultLocale) return null;
  const target = locales.find((l) => l === stored);
  return target && target !== current ? target : null;
}
