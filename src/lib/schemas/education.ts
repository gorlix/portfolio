import { z } from 'astro/zod';
import { isoDate, orTodo, text } from './common';

export const educationSchema = z.strictObject({
  institution: orTodo(text),
  degree: orTodo(text),
  /** Assente = non indicato (es. un diploma di cui conta solo l'anno di conseguimento). */
  start: orTodo(isoDate).optional(),
  /** `null` = in corso (o in pausa, con `paused`). */
  end: orTodo(isoDate.nullable()),
  /** Percorso sospeso: l'intervallo mostra la sospensione al posto di "in corso". */
  paused: z.boolean().optional(),
});

export const educationTranslatable = ['degree'];
