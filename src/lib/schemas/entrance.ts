import { z } from 'astro/zod';
import { text } from './common';

/** Terminale d'ingresso (`/`): tutto il copy vive qui, i componenti non contengono testo. */
export const entranceSchema = z.strictObject({
  /** Meta description della pagina (SEO e Open Graph). */
  metaDescription: text,
  /** Riga di comando che "lancia" il saluto. */
  command: text,
  /** Righe del saluto, nell'ordine in cui compaiono (la digitazione progressiva le scorre). */
  greeting: z.array(text).min(1),
  /** Domanda che introduce le scelte. */
  question: text,
  /** Ordine = ordine di visualizzazione e tasti 1/2/3. `path` e il percorso senza prefisso lingua. */
  choices: z
    .array(
      z.strictObject({
        id: z.enum(['human', 'recruiter', 'agent']),
        label: text,
        path: z.enum(['/human', '/recruiter', '/agent']),
      }),
    )
    .length(3),
});

export const entranceTranslatable = [
  'metaDescription',
  'command',
  'greeting.*',
  'question',
  'choices.*.label',
];
