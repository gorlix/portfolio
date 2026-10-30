import { z } from 'astro/zod';
import { text, url } from './common';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * Automazione Home Assistant (spec §8, §12.2). `room` rimanda a una stanza della casa della scena
 * (`human.domotica.rooms`).
 */
export const automationSchema = z.strictObject({
  name: text,
  room: id,
  /** Ordine di presentazione (crescente). */
  rank: z.number().int().optional(),
  trigger: text,
  conditions: z.array(text),
  actions: z.array(text).min(1),
  repo: url.optional(),
});

export type Automation = z.infer<typeof automationSchema>;

export const automationTranslatable = ['name', 'trigger', 'conditions.*', 'actions.*'];
