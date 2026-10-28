import type { SceneKind } from './capabilities';

/*
 * Quali scene sono micro-scene narrative (spec §7.3, §13): avanzano con lo scroll della sezione,
 * non si toccano e con reduced-motion restano come fotogramma statico finale.
 * Modulo senza dipendenze, letto sia da Scene.astro (in build) sia dal bootstrap.
 */
export const microScenes = ['lavori'] as const;

export function sceneKind(name: string): SceneKind {
  return (microScenes as readonly string[]).includes(name) ? 'micro' : 'interactive';
}
