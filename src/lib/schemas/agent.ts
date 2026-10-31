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
    /** Stato mostrato per ogni file generato alla build. */
    ok: text,
    /** Spiega che peso e impronta sono calcolati sui file veri. */
    note: text,
  }),
  entries: z.strictObject({
    title: text,
    /** Prefisso davanti a "usalo per" (stessa lingua del testo). */
    useFor: text,
    /** Una voce per file nella root, nell'ordine di `agentFileIds`. */
    items: z
      .array(
        z.strictObject({
          name: z.enum(agentFileIds),
          headline: text,
          description: text,
          use: text,
        }),
      )
      .length(agentFileIds.length),
  }),
  raw: z.strictObject({
    title: text,
    intro: text,
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
  'boot.note',
  'entries.title',
  'entries.useFor',
  'entries.items.*.headline',
  'entries.items.*.description',
  'entries.items.*.use',
  'raw.title',
  'raw.intro',
  'download',
];
