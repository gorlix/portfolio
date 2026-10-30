import { z } from 'astro/zod';
import { isoDate, orTodo, text } from './common';

/**
 * Pagine di approfondimento esistenti sotto `/human/lavori/<slug>/` (PORT-82). Un'esperienza le
 * indica con `detail`: e il dato, non il componente, a decidere dove compare "Approfondisci".
 */
export const detailPages = ['trimind'] as const;
export type DetailPage = (typeof detailPages)[number];

/**
 * Scenografia del livello dei Lavori (PORT-83): oggetti accanto alla strada, nell'ordine in cui il
 * pinguino ci passa davanti. Solo forme generiche: nessun dato reale d'infrastruttura.
 */
export const sceneryKinds = [
  'container',
  'firewall',
  'conveyor',
  'flag',
  'site',
  'bridge',
  'garden',
  'skyline',
] as const;
export type Scenery = (typeof sceneryKinds)[number];

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
  /** Lavoro o volontariato: l'albero di /human marca il volontariato come tale. */
  kind: z.enum(['work', 'volunteer']).default('work'),
  /** Dove compare su /human: nei Lavori o solo come argomento di Beneficenza; il CV la elenca comunque. */
  humanSection: z.enum(['lavori', 'beneficenza']).default('lavori'),
  /** Pagina di approfondimento dell'esperienza, se esiste. */
  detail: z.enum(detailPages).optional(),
  /** Scenografia del livello dei Lavori; senza, un default per lavoro o volontariato. */
  scenery: z.array(z.enum(sceneryKinds)).min(1).optional(),
});

export const experienceTranslatable = ['role', 'summary', 'results.*'];
