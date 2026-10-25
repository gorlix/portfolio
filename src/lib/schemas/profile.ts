import { z } from 'astro/zod';
import { orTodo, text, url } from './common';

export const profileSchema = z.strictObject({
  name: text,
  role: orTodo(text),
  location: text,
  availability: orTodo(text),
  tagline: orTodo(text),
  /** Unico punto dati per mailto e file per macchine. */
  email: z.email(),
  links: z.strictObject({
    github: url,
    linkedin: url,
    devto: orTodo(url),
    x: url,
  }),
  /** Percorso del CV (PDF) per lingua. */
  cv: orTodo(text),
});

export const profileTranslatable = ['role', 'location', 'availability', 'tagline', 'cv'];
