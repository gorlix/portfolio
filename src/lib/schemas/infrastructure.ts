import { z } from 'astro/zod';
import { text, url } from './common';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
/** Riga di log simulata: servizio che la emette e messaggio. */
const logLine = z.strictObject({ service: id, message: text });

/**
 * Infrastruttura SIMULATA della scena Homelab (spec §12.1, §11). Nomi e disposizione sono generici
 * o inventati: mai IP, domini, hostname o identificativi reali. La stessa voce alimenta la tabella
 * testuale di /human e la scena 3D (tramite `src/lib/homelab.ts`).
 */
export const infrastructureSchema = z
  .strictObject({
    simulated: z.literal(true),
    /** Le due piattaforme della scena: Casa e Produzione. */
    regions: z
      .array(z.strictObject({ id, name: text, kind: z.enum(['home', 'production']) }))
      .min(1),
    nodes: z.array(z.strictObject({ id, name: text, region: id })).min(1),
    services: z.array(z.strictObject({ id, name: text, node: id })),
    links: z.array(
      z.strictObject({
        from: id,
        to: id,
        kind: z.enum(['overlay', 'tunnel', 'backup', 'failover']),
      }),
    ),
    /** Decisioni architetturali: ogni ADR e collegato ad almeno un nodo (layer "Decisioni"). */
    adrs: z.array(
      z.strictObject({ id, title: text, summary: text, url, nodes: z.array(id).min(1) }),
    ),
    /** Strategia 3-2-1: un servizio d'origine, tre destinatari di cui almeno uno fuori sede. */
    backup: z.strictObject({
      source: id,
      targets: z
        .array(
          z.strictObject({
            id,
            name: text,
            medium: z.enum(['cloud', 'local']),
            offsite: z.boolean(),
          }),
        )
        .min(3),
    }),
    /** Lavori in corso, mostrati come strutture trasparenti "in costruzione". */
    wip: z.array(z.strictObject({ id, name: text, summary: text, region: id })),
    /**
     * Metriche e log della scena, generati nel browser con un seme (src/scripts/three/homelab/
     * metrics.ts). Messaggi tecnici, identici nelle due lingue, mai copiati da log veri.
     */
    simulation: z.strictObject({
      seed: z.number().int().nonnegative(),
      logs: z.array(logLine).min(1),
      failover: z.strictObject({ down: z.array(logLine).min(1), up: z.array(logLine).min(1) }),
    }),
  })
  .superRefine((infra, ctx) => {
    const regionIds = new Set(infra.regions.map((r) => r.id));
    const nodeIds = new Set(infra.nodes.map((n) => n.id));
    const serviceIds = new Set(infra.services.map((s) => s.id));
    const known = new Set([...regionIds, ...nodeIds, ...serviceIds]);
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });

    for (const [label, ids] of [
      ['regions', infra.regions],
      ['nodes', infra.nodes],
      ['services', infra.services],
      ['adrs', infra.adrs],
      ['backup.targets', infra.backup.targets],
      ['wip', infra.wip],
    ] as const) {
      if (new Set(ids.map((x) => x.id)).size !== ids.length) fail(`${label}: id duplicati`);
    }
    for (const n of infra.nodes)
      if (!regionIds.has(n.region)) fail(`nodo ${n.id}: region inesistente`);
    for (const s of infra.services)
      if (!nodeIds.has(s.node)) fail(`servizio ${s.id}: nodo inesistente`);
    for (const l of infra.links) {
      if (!known.has(l.from) || !known.has(l.to))
        fail(`link ${l.from} -> ${l.to}: riferimento inesistente`);
    }
    for (const a of infra.adrs)
      for (const n of a.nodes) if (!nodeIds.has(n)) fail(`adr ${a.id}: nodo ${n} inesistente`);
    if (!serviceIds.has(infra.backup.source))
      fail(`backup: servizio d'origine ${infra.backup.source} inesistente`);
    const media = new Set(infra.backup.targets.map((t) => t.medium));
    if (media.size < 2) fail('backup: servono almeno due supporti diversi (3-2-1)');
    if (!infra.backup.targets.some((t) => t.offsite))
      fail('backup: serve almeno una copia fuori sede (3-2-1)');
    for (const w of infra.wip)
      if (!regionIds.has(w.region)) fail(`wip ${w.id}: region inesistente`);
    const { logs, failover } = infra.simulation;
    for (const line of [...logs, ...failover.down, ...failover.up])
      if (!serviceIds.has(line.service)) fail(`log: servizio ${line.service} inesistente`);
  });

export type Infrastructure = z.infer<typeof infrastructureSchema>;

export const infrastructureTranslatable = [
  'regions.*.name',
  'services.*.name',
  'adrs.*.title',
  'adrs.*.summary',
  'backup.targets.*.name',
  'wip.*.name',
  'wip.*.summary',
];
