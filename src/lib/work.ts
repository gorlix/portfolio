import { isTodo, type Todo } from './schemas/common';
import type { DetailPage, Scenery } from './schemas/experiences';
import type { OpenSourceGroup } from './schemas/projects';

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
  scenery?: Scenery[] | undefined;
}

/** Livello del percorso: quanto basta alla scena (nessun testo, che sta nelle schede). */
export interface Level {
  slug: string;
  ongoing: boolean;
  volunteer: boolean;
  /** Ha una pagina di approfondimento. */
  detail: boolean;
  scenery: Scenery[];
}

export interface WorkCourse {
  levels: Level[];
}

/** Percorso (senza lingua) della pagina Open source (PORT-89). */
export const OPEN_SOURCE_PATH = '/human/lavori/open-source';
/** Ultimo livello dei Lavori: non e un'esperienza del CV, quindi non sta nei dati del CV. */
export const OPEN_SOURCE_LEVEL = 'open-source';

/** Solo le esperienze dei Lavori: le altre (es. Beneficenza) restano nel CV ma non sono livelli. */
export const inLavori = <T extends { humanSection: 'lavori' | 'beneficenza' }>(items: T[]): T[] =>
  items.filter((e) => e.humanSection === 'lavori');

/** Scenografia di un'esperienza che non la indica nei dati: una bandierina, o un giardino. */
export const defaultScenery = (kind: LevelInput['kind']): Scenery[] =>
  kind === 'volunteer' ? ['garden'] : ['flag'];

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
        scenery: e.scenery ?? defaultScenery(e.kind),
      })),
  };
}

/** Il percorso con la tappa Open source in fondo, dopo le esperienze. */
export const withOpenSource = ({ levels }: WorkCourse): WorkCourse => ({
  levels: [
    ...levels,
    {
      slug: OPEN_SOURCE_LEVEL,
      ongoing: true,
      volunteer: false,
      detail: true,
      scenery: ['skyline'],
    },
  ],
});

export interface OpenSourceProject {
  name: string;
  repo?: string | undefined;
  language: string | Todo;
  openSource?:
    | { group: OpenSourceGroup; description: string; stars: number; contribution: boolean }
    | undefined;
}

/**
 * Repository della pagina Open source, per gruppo: nell'ordine dei gruppi nei dati, dentro al
 * gruppo dal piu stellato. I gruppi vuoti spariscono; un repository senza gruppo, link o linguaggio
 * ferma la build invece di sparire in silenzio.
 */
export function groupRepos<G extends { id: OpenSourceGroup }>(
  groups: readonly G[],
  projects: readonly OpenSourceProject[],
  liveStars: ReadonlyMap<string, number>,
) {
  const repos = projects.flatMap((p) => {
    if (!p.openSource) return [];
    const { repo, language } = p;
    if (!repo || isTodo(language))
      throw new Error(`open source: ${p.name} senza repo o linguaggio`);
    const { group, description, contribution, stars } = p.openSource;
    if (!groups.some((g) => g.id === group))
      throw new Error(`open source: gruppo ${group} assente`);
    return [
      {
        name: p.name,
        repo,
        language,
        group,
        description,
        contribution,
        stars: liveStars.get(repo) ?? stars,
      },
    ];
  });
  return groups
    .map((g) => ({
      ...g,
      repos: repos
        .filter((r) => r.group === g.id)
        .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.repos.length > 0);
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
