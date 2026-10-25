import { z } from 'astro/zod';
import { text, url } from './common';

/** Automazione Home Assistant. Modello predisposto: si popola quando saranno pubbliche. */
export const automationSchema = z.strictObject({
  name: text,
  room: text,
  trigger: text,
  conditions: z.array(text),
  actions: z.array(text).min(1),
  repo: url.optional(),
});

export const automationTranslatable = ['name', 'room', 'trigger', 'conditions.*', 'actions.*'];
