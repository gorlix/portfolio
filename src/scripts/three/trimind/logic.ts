/*
 * Logica pura della mappa di Trimind (PORT-82): disposizione delle stazioni, serie simulate dei
 * grafici, ordine delle spunte, stato delle lastrine di backup. Niente three, niente DOM.
 */

/** Le cinque stazioni nell'ordine dei momenti; posizione del centro sul piano della mappa. */
export const STATIONS = [
  { id: 'infra', x: -5.5, z: -5.5 },
  { id: 'backup', x: 5.5, z: -5.5 },
  { id: 'cicd', x: 5.5, z: 1.5 },
  { id: 'observability', x: -5.5, z: 1.5 },
  { id: 'quality', x: 0, z: 8.5 },
] as const;

/** Ingombro di ogni stazione (larghezza, profondita) sul piano. */
export const PAD = { width: 8.4, depth: 6.4 };

/** Indice della stazione del momento, -1 per la panoramica (e per i nomi sconosciuti). */
export const stationOf = (name: string): number => STATIONS.findIndex((s) => s.id === name);

export interface Figures {
  services: number;
  repositories: number;
  retentionDays: number;
  tests: number;
  providers: number;
}

const KEYS: readonly (keyof Figures)[] = [
  'services',
  'repositories',
  'retentionDays',
  'tests',
  'providers',
];

/** Cifre dei dati della scena, o null se mancano o non sono interi positivi. */
export function parseFigures(raw: unknown): Figures | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const figures = raw as Record<string, unknown>;
  for (const key of KEYS) {
    const value = figures[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null;
  }
  return figures as unknown as Figures;
}

/** Generatore pseudo-casuale con seme (mulberry32): stessa sequenza a ogni caricamento. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Serie simulata e dolce (passeggiata casuale) di `count` valori tra 0,08 e 1. */
export function series(seed: number, count: number): number[] {
  const next = rng(seed);
  let value = 0.5;
  return Array.from({ length: count }, () => {
    value = Math.min(1, Math.max(0.08, value + (next() - 0.5) * 0.5));
    return value;
  });
}

/** Per ogni spunta, la posizione in cui diventa verde (permutazione con seme). */
export function checkRank(total: number, seed: number): number[] {
  const next = rng(seed);
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const rank = new Array<number>(total);
  order.forEach((check, position) => {
    rank[check] = position;
  });
  return rank;
}

/** Quante spunte sono verdi all'avanzamento 0..1. */
export const greenCount = (total: number, progress: number): number =>
  Math.round(Math.min(1, Math.max(0, progress)) * total);

/** Righe e colonne di una griglia larga circa due volte e mezza la sua altezza. */
export function gridOf(total: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * 2.5)));
  return { cols, rows: Math.ceil(total / cols) };
}

/**
 * Lastrina di backup all'eta `age` (in posti della fila): nasce piccola, resta piena fino alla
 * retention, poi sfuma in quattro posti (art. 17 GDPR: cancellazione alla scadenza).
 */
export function slab(age: number, retention: number): { scale: number; opacity: number } {
  return {
    scale: Math.min(1, Math.max(0, age)),
    opacity: age <= retention ? 1 : Math.max(0, 1 - (age - retention) / 4),
  };
}
