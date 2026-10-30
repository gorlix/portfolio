import type { SceneKind } from './capabilities';

/*
 * Quali scene sono micro-scene narrative (spec §7.3, §13): avanzano con lo scroll della sezione,
 * non si toccano e con reduced-motion restano come fotogramma statico finale.
 * Modulo senza dipendenze, letto sia da Scene.astro (in build) sia dal bootstrap.
 */
export const microScenes = [
  'certificazioni',
  'beneficenza',
  'contatti',
  'interessi',
  'sci',
  'tennis',
  'pallavolo',
] as const;

/**
 * Scene immersive (spec §7.3, PORT-76): sfondo fisso della sezione, usabile nella prima schermata
 * e guidato dalle schede mentre si scorre. Le altre sezioni restano com'erano finche il loro
 * storyboard non e approvato.
 */
export const immersiveScenes = [
  'scrivania',
  'homelab',
  'domotica',
  'lavori',
  'trimind',
  'opensource',
] as const;

export function sceneKind(name: string): SceneKind {
  if ((immersiveScenes as readonly string[]).includes(name)) return 'immersive';
  return (microScenes as readonly string[]).includes(name) ? 'micro' : 'interactive';
}
