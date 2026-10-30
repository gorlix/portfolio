import type { Automation } from './schemas/automations';

/*
 * Modello della sezione Domotica, unico per l'elenco testuale e per la scena 3D (spec §12.2).
 * La pagina rende l'elenco da qui e passa alla scena lo stesso oggetto come blocco JSON.
 * Funzione pura: nessuna dipendenza da Astro o three.
 */

export interface DomoticaRoomInput {
  id: string;
  name: string;
  kind: 'room' | 'house';
}

export interface DomoticaEntry {
  slug: string;
  data: Automation;
}

export interface DomoticaRoom extends DomoticaRoomInput {
  /** Slug delle automazioni della stanza, nell'ordine dell'elenco. */
  automations: string[];
}

export interface DomoticaModel {
  rooms: DomoticaRoom[];
  /** Tutte le automazioni, ordinate per `rank` e poi per slug. */
  automations: { slug: string; name: string; room: string }[];
}

export function domoticaModel(rooms: DomoticaRoomInput[], entries: DomoticaEntry[]): DomoticaModel {
  const known = new Set(rooms.map((r) => r.id));
  for (const { slug, data } of entries) {
    if (!known.has(data.room))
      throw new Error(`automazione ${slug}: stanza ${data.room} inesistente`);
  }
  const sorted = [...entries].sort(
    (a, b) => (a.data.rank ?? 99) - (b.data.rank ?? 99) || a.slug.localeCompare(b.slug),
  );
  return {
    rooms: rooms.map((r) => ({
      ...r,
      automations: sorted.filter((e) => e.data.room === r.id).map((e) => e.slug),
    })),
    automations: sorted.map(({ slug, data }) => ({ slug, name: data.name, room: data.room })),
  };
}
