import { z } from 'astro/zod';
import { isoDate, orTodo, text, url } from './common';

export const certificationSchema = z.strictObject({
  name: orTodo(text),
  issuer: orTodo(text),
  date: orTodo(isoDate),
  verifyUrl: orTodo(url),
  kind: orTodo(z.enum(['technical', 'supplementary'])),
  /** `in-progress` = percorso di studio avviato, non ancora conseguita. */
  status: z.enum(['earned', 'in-progress']),
});

export const certificationTranslatable = ['name'];
