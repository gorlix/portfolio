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
  /** Percorso del CV (PDF) per lingua, sotto `public/` (es. `/cv/alessandro-gorla-it.pdf`). */
  cv: orTodo(text),
  /** Foto reale per `/recruiter`: file in `src/assets/` (percorso dalla radice del repo) e testo alternativo. */
  photo: orTodo(z.strictObject({ src: text, alt: text })),
});

export const profileTranslatable = [
  'role',
  'location',
  'availability',
  'tagline',
  'cv',
  'photo.alt',
];
