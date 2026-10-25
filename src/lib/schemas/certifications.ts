import { z } from 'astro/zod';
import { isoDate, orTodo, text, url } from './common';

export const certificationSchema = z.strictObject({
  name: orTodo(text),
  issuer: orTodo(text),
  date: orTodo(isoDate),
  verifyUrl: orTodo(url),
  kind: orTodo(z.enum(['technical', 'supplementary'])),
});

export const certificationTranslatable: string[] = [];
