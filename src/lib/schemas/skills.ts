import { z } from 'astro/zod';
import { sectionId, text } from './common';

export const skillSchema = z.strictObject({
  name: text,
  group: text,
  kind: z.enum(['technical', 'supplementary']),
  linkedSection: sectionId,
  badge: z.boolean().optional(),
});

export const skillTranslatable = ['group'];
