import { z } from 'astro/zod';
import { isoDate, orTodo, text } from './common';

/**
 * Pagine di approfondimento esistenti sotto `/human/lavori/<slug>/` (PORT-82). Un'esperienza le
 * indica con `detail`: e il dato, non il componente, a decidere dove compare "Approfondisci".
 */
export const detailPages = ['trimind'] as const;
export type DetailPage = (typeof detailPages)[number];

/**
 * Pezzi del percorso a piattaforme dei Lavori (PORT-83), uno per ostacolo, nell'ordine in cui il
 * pinguino li attraversa. Solo forme generiche: nessun dato reale d'infrastruttura.
 */
export const obstacleKinds = [
  'platform',
  'container',
  'firewall',
  'conveyor',
  'flag',
  'site',
  'bridge',
  'garden',
] as const;
export type Obstacle = (typeof obstacleKinds)[number];

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
  /** Pagina di approfondimento dell'esperienza, se esiste. */
  detail: z.enum(detailPages).optional(),
  /** Livello del percorso dei Lavori; senza, un default per lavoro o volontariato. */
  obstacles: z.array(z.enum(obstacleKinds)).min(1).optional(),
});

export const experienceTranslatable = ['role', 'summary', 'results.*'];
