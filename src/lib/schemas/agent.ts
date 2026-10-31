import { z } from 'astro/zod';
import { text } from './common';

export const agentFileIds = [
  'llms.txt',
  'profile.json',
  'agent.md',
  'robots.txt',
  'sitemap.xml',
] as const;

/** Vetrina `/agent`: copy dell'interfaccia. Il contenuto dei file viene dai generatori, mai da qui. */
export const agentSchema = z.strictObject({
  titleSuffix: text,
  metaDescription: text,
  /** Link discreto e persistente verso la scelta del percorso (`/`). */
  backToChoice: text,
  menuLabel: text,
  links: z.strictObject({ human: text, recruiter: text }),
  /** Spiega che i file sono in inglese in entrambe le lingue del sito. */
  languageNote: text,
  /** Etichetta davanti al ruolo nella barra della console. */
  unitLabel: text,
  /** Saluto della macchina: due frasi brevi, calde. */
  greeting: text,
  boot: z.strictObject({
    title: text,
    /** Stato mostrato davanti a ogni riga di avvio. */
    ok: text,
    profile: text,
    skills: text,
    projects: text,
    contacts: text,
  }),
  about: z.strictObject({
    title: text,
    role: text,
    where: text,
    availability: text,
  }),
  skills: z.strictObject({ title: text, intro: text }),
  projects: z.strictObject({ title: text, intro: text, repo: text }),
  contact: z.strictObject({
    title: text,
    intro: text,
    email: text,
    github: text,
    linkedin: text,
  }),
  sources: z.strictObject({
    title: text,
    intro: text,
    /** Una voce per file nella root, nell'ordine di `agentFileIds`. */
    items: z
      .array(z.strictObject({ name: z.enum(agentFileIds), description: text }))
      .length(agentFileIds.length),
    /** Spiega che peso e impronta sono calcolati sui file reali. */
    note: text,
    rawIntro: text,
  }),
  /** Prefisso del comando mostrato prima del nome del file. Identico nelle due lingue. */
  command: text,
  download: text,
});

export const agentTranslatable = [
  'titleSuffix',
  'metaDescription',
  'backToChoice',
  'menuLabel',
  'links.human',
  'links.recruiter',
  'languageNote',
  'unitLabel',
  'greeting',
  'boot.title',
  'boot.ok',
  'boot.profile',
  'boot.skills',
  'boot.projects',
  'boot.contacts',
  'about.title',
  'about.role',
  'about.where',
  'about.availability',
  'skills.title',
  'skills.intro',
  'projects.title',
  'projects.intro',
  'projects.repo',
  'contact.title',
  'contact.intro',
  'contact.email',
  'sources.title',
  'sources.intro',
  'sources.items.*.description',
  'sources.note',
  'sources.rawIntro',
  'download',
];
