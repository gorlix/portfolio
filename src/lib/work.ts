import { isTodo, type Todo } from './schemas/common';
import type { DetailPage, Obstacle } from './schemas/experiences';

/*
 * Percorso dei Lavori di /human (spec §7.3, §13, PORT-83) e pagine di approfondimento (PORT-82).
 * Logica PURA, senza Astro ne three: la pagina e la scena leggono lo stesso modello, cosi una nuova
 * esperienza nei dati aggiunge sia la scheda sia il livello del percorso.
 */

export interface LevelInput {
  slug: string;
  start: string | Todo;
  end: string | null | Todo;
  kind: 'work' | 'volunteer';
  detail?: DetailPage | undefined;
  obstacles?: Obstacle[] | undefined;
}

/** Livello del percorso: quanto basta alla scena (nessun testo, che sta nelle schede). */
export interface Level {
  slug: string;
  ongoing: boolean;
  volunteer: boolean;
  /** Ha una pagina di approfondimento. */
  detail: boolean;
  obstacles: Obstacle[];
}

export interface WorkCourse {
  levels: Level[];
}

/** Livello di un'esperienza senza ostacoli nei dati: un gradino e l'arrivo, o un giardino. */
export const defaultObstacles = (kind: LevelInput['kind']): Obstacle[] =>
  kind === 'volunteer' ? ['garden'] : ['platform', 'flag'];

/**
 * Ordine cronologico, dalla piu vecchia. Senza data d'inizio nota l'esperienza va per prima;
 * a parita, l'ordine e quello dello slug.
 */
export function chronological<T extends { slug: string; start: string | Todo }>(items: T[]): T[] {
  const start = (e: T) => (isTodo(e.start) ? '' : e.start);
  return [...items].sort(
    (a, b) => start(a).localeCompare(start(b)) || a.slug.localeCompare(b.slug),
  );
}

/**
 * Livelli nell'ordine delle schede: dalla piu recente (deciso da Alessandro), un livello per
 * esperienza, cosi il pinguino attraversa il livello della scheda che si sta leggendo.
 */
export function workCourse(items: LevelInput[]): WorkCourse {
  return {
    levels: chronological(items)
      .reverse()
      .map((e) => ({
        slug: e.slug,
        ongoing: e.end === null,
        volunteer: e.kind === 'volunteer',
        detail: e.detail !== undefined,
        obstacles: e.obstacles ?? defaultObstacles(e.kind),
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
