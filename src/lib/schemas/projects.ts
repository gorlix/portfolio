import { z } from 'astro/zod';
import { orTodo, sectionId, text, url } from './common';

export const projectMethods = ['by-hand', 'ai-copilot', 'vibecoded'] as const;

/**
 * Gruppi della pagina Open source (`/human/lavori/open-source/`, PORT-89): uno per quartiere della
 * citta. Nome, frase e ordine stanno in `human.openSource.groups`.
 */
export const openSourceGroups = [
  'supernote',
  'claude-code',
  'paca',
  'homelab',
  'hardware',
  'community',
  'portfolio',
] as const;
export type OpenSourceGroup = (typeof openSourceGroups)[number];

export const projectSchema = z.strictObject({
  name: text,
  description: orTodo(text),
  /** Assente se il progetto non ha un repository pubblico. */
  repo: url.optional(),
  language: orTodo(text),
  method: orTodo(z.enum(projectMethods)),
  status: orTodo(z.enum(['active', 'wip', 'archived'])),
  featured: z.boolean(),
  /** Ordine tra i progetti in evidenza (1 = primo); assente = in coda. */
  rank: z.number().int().positive().optional(),
  /** Sezione del percorso Umano dove il progetto compare in modo esplicito (homelab, domotica). */
  section: sectionId.optional(),
  /** Presente = il repository compare nella pagina Open source; richiede `repo` e `language`. */
  openSource: z
    .strictObject({
      group: z.enum(openSourceGroups),
      /** Una riga per la scheda: `description` e il testo piu lungo del CV. */
      description: text,
      /** Stelle di riserva: al build vale il dato di GitHub, se raggiungibile. */
      stars: z.number().int().min(0),
      /** Repository di altri a cui ho contribuito: le stelle sono del progetto, non mie. */
      contribution: z.boolean().default(false),
    })
    .optional(),
});

export const projectTranslatable = ['name', 'description', 'openSource.description'];
