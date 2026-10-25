import { z } from 'astro/zod';

export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];

/** Sezioni dell'esperienza Umano (§4 della spec). Identificatori stabili, mai tradotti. */
export const sectionIds = [
  'lavori',
  'homelab',
  'domotica',
  'certificazioni',
  'sport',
  'interessi',
  'beneficenza',
  'contatti',
] as const;
export const sectionId = z.enum(sectionIds);

export const text = z.string().trim().min(1);
export const url = z.url({ protocol: /^https$/ });
/** Anno-mese o data completa, sempre tra apici nei YAML (altrimenti il parser produce una Date). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);

/**
 * Dato non ancora fornito da Alessandro: `{ todo: "cosa serve e da dove" }`.
 * Le pagine lo rendono come segnaposto ben visibile, mai come contenuto.
 */
export const todo = z.strictObject({ todo: text });
export type Todo = z.infer<typeof todo>;

export const orTodo = <T extends z.ZodType>(schema: T) => z.union([schema, todo]);

export const isTodo = (value: unknown): value is Todo =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  'todo' in value;
