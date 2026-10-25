import { z } from 'astro/zod';
import { sectionId, sectionIds, text } from './common';

/** Ordine e titoli delle sezioni. I colori vivono solo in src/styles/theme.css (--sec-*). */
export const themeSchema = z
  .strictObject({
    sections: z.array(z.strictObject({ id: sectionId, title: text })),
  })
  .superRefine((theme, ctx) => {
    const ids = theme.sections.map((s) => s.id);
    const missing = sectionIds.filter((id) => !ids.includes(id));
    if (missing.length || new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: `sections deve elencare ogni sezione una sola volta (mancano: ${missing.join(', ') || 'nessuna'})`,
      });
    }
  });

export const themeTranslatable = ['sections.*.title'];
