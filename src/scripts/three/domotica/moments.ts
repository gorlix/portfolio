import type { DomoticaModel } from '../../../lib/domotica';

/*
 * Momenti del racconto della Domotica (spec §7.3, PORT-80). Le schede sono ricavate dai dati:
 * il nome del momento (`data-moment`) e lo slug di un'automazione, o piu slug uniti da "+" per una
 * scheda che racconta una catena. Da qui la scena sa quali stanze inquadrare e accendere.
 * Gli altri momenti hanno un nome fisso: clima, audio multi-room, aria e meteo, progetti.
 * Logica PURA, senza three ne DOM.
 */

/** Momenti con nome fisso, nell'ordine in cui la pagina li usa intorno alle automazioni. */
export const fixedMoments = ['overview', 'climate', 'audio', 'weather', 'projects'] as const;
type Fixed = (typeof fixedMoments)[number];

export type MomentFocus =
  | { kind: Fixed }
  | {
      kind: 'automations';
      /** Stanze (kind 'room') coinvolte, nell'ordine della pianta, senza doppioni. */
      rooms: string[];
      /** Almeno un'automazione riguarda tutta la casa. */
      house: boolean;
    };

/** Separatore tra gli slug di una scheda a catena. */
export const CHAIN = '+';

export function momentFocus(name: string | undefined, model: DomoticaModel): MomentFocus {
  const fixed = fixedMoments.find((m) => m === name);
  if (fixed) return { kind: fixed };
  const slugs = (name ?? '').split(CHAIN).filter(Boolean);
  const touched = new Set(
    slugs
      .map((slug) => model.automations.find((a) => a.slug === slug)?.room)
      .filter((room): room is string => room !== undefined),
  );
  if (touched.size === 0) return { kind: 'overview' };
  const kinds = new Map(model.rooms.map((r) => [r.id, r.kind]));
  return {
    kind: 'automations',
    rooms: model.rooms.filter((r) => r.kind === 'room' && touched.has(r.id)).map((r) => r.id),
    house: [...touched].some((id) => kinds.get(id) === 'house'),
  };
}
