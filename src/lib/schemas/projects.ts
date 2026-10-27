import { z } from 'astro/zod';
import { orTodo, sectionId, text, url } from './common';

export const projectMethods = ['by-hand', 'ai-copilot', 'vibecoded'] as const;

export const projectSchema = z.strictObject({
  name: text,
  description: orTodo(text),
  repo: url,
  language: orTodo(text),
  method: orTodo(z.enum(projectMethods)),
  status: orTodo(z.enum(['active', 'wip', 'archived'])),
  featured: z.boolean(),
  /** Ordine tra i progetti in evidenza (1 = primo); assente = in coda. */
  rank: z.number().int().positive().optional(),
  /** Sezione del percorso Umano dove il progetto compare in modo esplicito (homelab, domotica). */
  section: sectionId.optional(),
});

export const projectTranslatable = ['description'];
