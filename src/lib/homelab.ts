import type { Infrastructure } from './schemas/infrastructure';

/*
 * Modello della sezione Homelab, unico per la tabella testuale e per la scena 3D (spec §12.1).
 * La pagina rende la tabella da qui e passa lo stesso oggetto alla scena come blocco JSON:
 * cosi le due viste non possono divergere. Funzione pura, nessuna dipendenza da Astro o three.
 */

export interface HomelabService {
  id: string;
  name: string;
}

export interface HomelabNode {
  id: string;
  name: string;
  services: HomelabService[];
  /** ADR collegati al nodo (layer "Decisioni"), nell'ordine dei dati. */
  adrs: string[];
}

export interface HomelabRegion {
  id: string;
  name: string;
  kind: 'home' | 'production';
  nodes: HomelabNode[];
  /** Lavori in corso ospitati dal sito. */
  wip: string[];
}

export interface HomelabEndpoint {
  service: string;
  node: string;
}

export interface HomelabModel {
  regions: HomelabRegion[];
  adrs: Infrastructure['adrs'];
  backup: {
    source: HomelabEndpoint & { name: string };
    targets: Infrastructure['backup']['targets'];
  };
  wip: Infrastructure['wip'];
  /** Coppie di siti uniti dalla rete overlay. */
  overlays: [string, string][];
  /** Coppia primario/backup dietro l'IP virtuale; assente se i dati non la dichiarano. */
  failover?: { primary: HomelabEndpoint; backup: HomelabEndpoint };
  /** Seme e righe di log della simulazione (metriche e log generati nel browser). */
  simulation: Infrastructure['simulation'];
}

export function homelabModel(infra: Infrastructure): HomelabModel {
  const serviceById = new Map(infra.services.map((s) => [s.id, s]));
  const endpoint = (serviceId: string): HomelabEndpoint => ({
    service: serviceId,
    node: serviceById.get(serviceId)?.node ?? '',
  });

  const regions = infra.regions.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    nodes: infra.nodes
      .filter((n) => n.region === r.id)
      .map((n) => ({
        id: n.id,
        name: n.name,
        services: infra.services
          .filter((s) => s.node === n.id)
          .map(({ id, name }) => ({ id, name })),
        adrs: infra.adrs.filter((a) => a.nodes.includes(n.id)).map((a) => a.id),
      })),
    wip: infra.wip.filter((w) => w.region === r.id).map((w) => w.id),
  }));

  const failover = infra.links.find((l) => l.kind === 'failover');
  const source = serviceById.get(infra.backup.source);

  return {
    regions,
    adrs: infra.adrs,
    backup: {
      source: { ...endpoint(infra.backup.source), name: source?.name ?? infra.backup.source },
      targets: infra.backup.targets,
    },
    wip: infra.wip,
    overlays: infra.links
      .filter((l) => l.kind === 'overlay')
      .map((l) => [l.from, l.to] as [string, string]),
    simulation: infra.simulation,
    ...(failover && {
      failover: { primary: endpoint(failover.from), backup: endpoint(failover.to) },
    }),
  };
}
