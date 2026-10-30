import { z } from 'astro/zod';
import { isoDate, text, url } from './common';

export const certificationSchema = z.strictObject({
  name: text,
  issuer: text.optional(),
  date: isoDate.optional(),
  verifyUrl: url.optional(),
  /** Codice della credenziale, quando non c'e un link pubblico per verificarla. */
  credentialId: text.optional(),
  kind: z.enum(['technical', 'supplementary']),
  /** `in-progress` = percorso di studio avviato, non ancora conseguita. */
  status: z.enum(['earned', 'in-progress']),
  /** Ordine nella bacheca di /human (piu basso = prima); senza, in fondo. */
  rank: z.number().int().positive().optional(),
  /** Oggetto accanto all'esagono nella bacheca: `cluster` = piccoli cubi collegati. */
  scenery: z.enum(['cluster']).optional(),
});

export const certificationTranslatable = ['name'];
