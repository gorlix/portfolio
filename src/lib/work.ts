import { isTodo, type Todo } from './schemas/common';
import type { DetailPage } from './schemas/experiences';

/*
 * Albero dei Lavori di /human (spec §7.3, §13, PORT-81) e pagine di approfondimento (PORT-82).
 * Logica PURA, senza Astro ne three: la pagina e la scena leggono lo stesso modello, cosi una nuova
 * esperienza nei dati aggiunge sia la scheda sia la foglia.
 */

export type Side = 'left' | 'right';

export interface LeafInput {
  slug: string;
  start: string | Todo;
  end: string | null | Todo;
  kind: 'work' | 'volunteer';
  detail?: DetailPage | undefined;
}

/** Foglia dell'albero: quanto basta alla scena (nessun testo, che sta nelle schede). */
export interface Leaf {
  slug: string;
  side: Side;
  ongoing: boolean;
  volunteer: boolean;
  /** Ha una pagina di approfondimento. */
  detail: boolean;
}

export interface WorkTree {
  leaves: Leaf[];
}

/**
 * Ordine dell'albero: cronologico, dal basso (piu vecchia) verso l'alto. Senza data d'inizio nota
 * l'esperienza va in fondo all'albero, prima delle altre; a parita, l'ordine e quello dello slug.
 */
export function chronological<T extends { slug: string; start: string | Todo }>(items: T[]): T[] {
  const start = (e: T) => (isTodo(e.start) ? '' : e.start);
  return [...items].sort(
    (a, b) => start(a).localeCompare(start(b)) || a.slug.localeCompare(b.slug),
  );
}

/** Rami alternati: la prima foglia a sinistra, poi destra, sinistra... */
export const sideAt = (index: number): Side => (index % 2 === 0 ? 'left' : 'right');

export function workTree(items: LeafInput[]): WorkTree {
  return {
    leaves: chronological(items).map((e, i) => ({
      slug: e.slug,
      side: sideAt(i),
      ongoing: e.end === null,
      volunteer: e.kind === 'volunteer',
      detail: e.detail !== undefined,
    })),
  };
}

/** Percorso (senza lingua) della pagina di approfondimento. */
export const detailPath = (page: DetailPage): string => `/human/lavori/${page}`;

/**
 * Un punto del CV nella forma "Etichetta: testo" diviso in etichetta e testo, per mostrare
 * l'etichetta in grassetto. Senza etichetta (nessun ":" entro le prime parole) resta tutto testo.
 */
export function splitResult(result: string): { label?: string; text: string } {
  const at = result.indexOf(': ');
  if (at <= 0 || at > 40) return { text: result };
  return { label: result.slice(0, at), text: result.slice(at + 2) };
}
