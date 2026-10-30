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
/** Percorso Umano: la Home e la prima tappa, ma non e un collegamento valido per le competenze. */
export const humanSectionIds = ['home', ...sectionIds] as const;
export const humanSectionId = z.enum(humanSectionIds);

export const text = z.string().trim().min(1);
export const url = z.url({ protocol: /^https$/ });
/** Anno, anno-mese o data completa, sempre tra apici nei YAML (altrimenti il parser produce una Date). */
export const isoDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);
