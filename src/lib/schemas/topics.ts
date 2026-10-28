import { z } from 'astro/zod';
import { orTodo, text, url } from './common';

/** Sport, interessi e beneficenza: stessa forma, `section` decide dove compaiono. */
export const topicSchema = z.strictObject({
  section: z.enum(['sport', 'interessi', 'beneficenza']),
  title: text,
  /** Frase breve della micro-scena (spec §13), prima del testo: opzionale. */
  tagline: text.optional(),
  /** Testo in prima persona: e copy di Alessandro, finche manca resta un `todo`. */
  text: orTodo(text),
  links: z.array(z.strictObject({ label: text, url })),
});

export const topicTranslatable = ['title', 'tagline', 'text', 'links.*.label'];
