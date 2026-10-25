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
  /** Prefisso del comando mostrato prima del nome del file. Identico nelle due lingue. */
  command: text,
  download: text,
  table: z.strictObject({
    caption: text,
    file: text,
    description: text,
    link: text,
  }),
  /** Una riga per file nella root, nell'ordine di tabella. */
  files: z
    .array(z.strictObject({ name: z.enum(agentFileIds), description: text }))
    .length(agentFileIds.length),
});

export const agentTranslatable = [
  'titleSuffix',
  'metaDescription',
  'backToChoice',
  'menuLabel',
  'links.human',
  'links.recruiter',
  'languageNote',
  'download',
  'table.caption',
  'table.file',
  'table.description',
  'table.link',
  'files.*.description',
];
