import { z } from 'astro/zod';
import { text } from './common';

/** Ancore della landing `/recruiter`: identificatori stabili, mai tradotti (come `sectionIds`). */
export const recruiterSectionIds = [
  'profilo',
  'competenze',
  'esperienze',
  'certificazioni',
  'progetti',
  'formazione',
  'contatti',
] as const;
export const recruiterSectionId = z.enum(recruiterSectionIds);

/** Copy della landing `/recruiter`: i componenti non contengono testo. */
export const recruiterSchema = z
  .strictObject({
    /** Dopo il nome nel `<title>`. */
    titleSuffix: text,
    metaDescription: text,
    menuLabel: text,
    /** Link discreto e persistente verso la scelta del percorso (`/`). */
    backToChoice: text,
    /** Ordine = ordine di pagina e del menu. */
    sections: z.array(z.strictObject({ id: recruiterSectionId, title: text })),
    links: z.strictObject({ human: text, agent: text }),
    /** Progetti: nota introduttiva sul metodo di lavoro e dicitura neutra per ciascun metodo. */
    projects: z.strictObject({
      intro: text,
      methodLabel: text,
      methods: z.strictObject({ 'by-hand': text, 'ai-copilot': text, vibecoded: text }),
    }),
    /** Etichetta del segnaposto per i dati non ancora forniti. */
    todoLabel: text,
    labels: z.strictObject({
      location: text,
      availability: text,
      ongoing: text,
      paused: text,
      languages: text,
      results: text,
      stack: text,
      issuer: text,
      verify: text,
      technicalCertifications: text,
      supplementaryCertifications: text,
      repository: text,
      language: text,
      email: text,
      profiles: text,
      cv: text,
    }),
  })
  .superRefine((page, ctx) => {
    const ids = page.sections.map((s) => s.id);
    const missing = recruiterSectionIds.filter((id) => !ids.includes(id));
    if (missing.length || new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: `sections deve elencare ogni sezione una sola volta (mancano: ${missing.join(', ') || 'nessuna'})`,
      });
    }
  });

export const recruiterTranslatable = [
  'titleSuffix',
  'metaDescription',
  'menuLabel',
  'backToChoice',
  'sections.*.title',
  'links.human',
  'links.agent',
  'projects.intro',
  'projects.methodLabel',
  'projects.methods.by-hand',
  'projects.methods.ai-copilot',
  'projects.methods.vibecoded',
  'labels.location',
  'labels.availability',
  'labels.ongoing',
  'labels.paused',
  'labels.languages',
  'labels.results',
  'labels.stack',
  'labels.issuer',
  'labels.verify',
  'labels.technicalCertifications',
  'labels.supplementaryCertifications',
  'labels.repository',
  'labels.language',
  'labels.email',
  'labels.profiles',
  'labels.cv',
];
