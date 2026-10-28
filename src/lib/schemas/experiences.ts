import { z } from 'astro/zod';
import { isoDate, orTodo, text } from './common';

export const experienceSchema = z.strictObject({
  company: orTodo(text),
  role: orTodo(text),
  /** Contesto in una riga (tipo di incarico, ruolo nel progetto). */
  summary: text.optional(),
  start: orTodo(isoDate),
  /** `null` = in corso. */
  end: orTodo(isoDate.nullable()),
  results: orTodo(z.array(text).min(1)),
  stack: orTodo(z.array(text)),
});

export const experienceTranslatable = ['role', 'summary', 'results.*'];
