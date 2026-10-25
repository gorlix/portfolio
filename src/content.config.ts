import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { collections as definitions } from './lib/data/collections';

// Un loader per collezione: oggi glob su YAML, sostituibile a build time senza toccare le pagine.
export const collections = Object.fromEntries(
  Object.entries(definitions).map(([name, def]) => [
    name,
    defineCollection({
      loader: glob({
        base: `./src/content/${name}`,
        pattern: def.kind === 'singleton' ? '{it,en}.yml' : '{it,en}/*.yml',
      }),
      schema: def.schema,
    }),
  ]),
);
