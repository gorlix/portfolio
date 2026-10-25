import type { z } from 'astro/zod';
import { automationSchema, automationTranslatable } from '../schemas/automations';
import { certificationSchema, certificationTranslatable } from '../schemas/certifications';
import { experienceSchema, experienceTranslatable } from '../schemas/experiences';
import { infrastructureSchema, infrastructureTranslatable } from '../schemas/infrastructure';
import { profileSchema, profileTranslatable } from '../schemas/profile';
import { projectSchema, projectTranslatable } from '../schemas/projects';
import { skillSchema, skillTranslatable } from '../schemas/skills';
import { themeSchema, themeTranslatable } from '../schemas/theme';
import { topicSchema, topicTranslatable } from '../schemas/topics';
import { uiSchema, uiTranslatable } from '../schemas/ui';

export interface CollectionDef {
  /**
   * `singleton`: un file per lingua (`src/content/<nome>/<locale>.yml`).
   * `folder`: una voce per slug (`src/content/<nome>/<locale>/<slug>.yml`).
   * Layout compatibile con l'i18n `multiple_folders` di Decap/Sveltia.
   */
  kind: 'singleton' | 'folder';
  schema: z.ZodType;
  /** Percorsi (con `*` per gli array) dei campi che DEVONO differire tra lingue; gli altri sono identici. */
  translatable: string[];
}

export const collections = {
  profile: { kind: 'singleton', schema: profileSchema, translatable: profileTranslatable },
  theme: { kind: 'singleton', schema: themeSchema, translatable: themeTranslatable },
  ui: { kind: 'singleton', schema: uiSchema, translatable: uiTranslatable },
  infrastructure: {
    kind: 'singleton',
    schema: infrastructureSchema,
    translatable: infrastructureTranslatable,
  },
  skills: { kind: 'folder', schema: skillSchema, translatable: skillTranslatable },
  experiences: { kind: 'folder', schema: experienceSchema, translatable: experienceTranslatable },
  certifications: {
    kind: 'folder',
    schema: certificationSchema,
    translatable: certificationTranslatable,
  },
  projects: { kind: 'folder', schema: projectSchema, translatable: projectTranslatable },
  automations: { kind: 'folder', schema: automationSchema, translatable: automationTranslatable },
  topics: { kind: 'folder', schema: topicSchema, translatable: topicTranslatable },
} as const satisfies Record<string, CollectionDef>;

export type CollectionName = keyof typeof collections;
