import type { SceneKind } from './capabilities';

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
  'certificazioni',
  'sport',
  'interessi',
  'beneficenza',
  'contatti',
] as const;

export function sceneKind(name: string): SceneKind {
  return (immersiveScenes as readonly string[]).includes(name) ? 'immersive' : 'interactive';
}
