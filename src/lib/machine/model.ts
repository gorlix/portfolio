import { getEntries, getSingleton } from '../data';
import { absoluteUrl, localizedPath } from '../i18n';
import { isTodo, type Locale, locales, type Todo } from '../schemas/common';

/** Un valore in entrambe le lingue, sempre da una sola fonte dati. */
export type Bilingual<T = string> = Record<Locale, T>;

export interface MachinePage {
  id: 'home' | 'human' | 'recruiter' | 'agent';
  urls: Bilingual;
}

export interface MachineModel {
  name: string;
  /** Campi opzionali: assenti finche Alessandro non fornisce il dato (mai segnaposto nei file per macchine). */
  role?: Bilingual | undefined;
  location: Bilingual;
  availability?: Bilingual | undefined;
  tagline?: Bilingual | undefined;
  email: string;
  links: { github: string; linkedin: string; x: string; devto?: string | undefined };
  pages: MachinePage[];
  skills: { name: string; group: Bilingual; kind: 'technical' | 'supplementary' }[];
  projects: {
    slug: string;
    name: string;
    repo: string;
    description?: Bilingual | undefined;
    language?: string | undefined;
    method?: string | undefined;
    status?: string | undefined;
    featured: boolean;
  }[];
}

const known = <T>(value: T | Todo): T | undefined => (isTodo(value) ? undefined : value);

/** Valore bilingue solo se noto in entrambe le lingue (la parita dei todo e verificata dai dati). */
function bilingual<T>(pick: (locale: Locale) => T | Todo): Bilingual<T> | undefined {
  const [it, en] = locales.map((l) => known(pick(l)));
  return it !== undefined && en !== undefined ? ({ it, en } as Bilingual<T>) : undefined;
}

const pageDefs: [MachinePage['id'], string][] = [
  ['home', '/'],
  ['human', '/human'],
  ['recruiter', '/recruiter'],
  ['agent', '/agent'],
];

/** Costruisce il modello unico da cui derivano llms.txt, agent.md e profile.json. */
export async function loadMachineModel(): Promise<MachineModel> {
  const [pIt, pEn, skillsIt, skillsEn, projIt, projEn] = await Promise.all([
    getSingleton('profile', 'it'),
    getSingleton('profile', 'en'),
    getEntries('skills', 'it'),
    getEntries('skills', 'en'),
    getEntries('projects', 'it'),
    getEntries('projects', 'en'),
  ]);
  const profile: Bilingual<typeof pIt> = { it: pIt, en: pEn };
  const of = <T>(pick: (p: typeof pIt) => T | Todo) => bilingual((l) => pick(profile[l]));

  return {
    name: pEn.name,
    role: of((p) => p.role),
    location: { it: pIt.location, en: pEn.location },
    availability: of((p) => p.availability),
    tagline: of((p) => p.tagline),
    email: pEn.email,
    links: {
      github: pEn.links.github,
      linkedin: pEn.links.linkedin,
      x: pEn.links.x,
      devto: known(pEn.links.devto),
    },
    pages: pageDefs.map(([id, path]) => ({
      id,
      urls: {
        it: absoluteUrl(localizedPath(path, 'it')),
        en: absoluteUrl(localizedPath(path, 'en')),
      },
    })),
    skills: skillsEn.map((s, i) => ({
      name: s.data.name,
      group: { it: skillsIt[i]?.data.group ?? s.data.group, en: s.data.group },
      kind: s.data.kind,
    })),
    projects: projEn.map((p, i) => ({
      slug: p.slug,
      name: p.data.name,
      repo: p.data.repo,
      description: bilingual((l) => (l === 'it' ? projIt[i] : p)?.data.description as string),
      language: known(p.data.language),
      method: known(p.data.method),
      status: known(p.data.status),
      featured: p.data.featured,
    })),
  };
}
