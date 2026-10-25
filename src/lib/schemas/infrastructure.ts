import { z } from 'astro/zod';
import { text, url } from './common';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * Infrastruttura SIMULATA della scena Homelab. Nomi e disposizione sono generici o inventati:
 * mai IP, domini, hostname o identificativi reali.
 */
export const infrastructureSchema = z
  .strictObject({
    simulated: z.literal(true),
    regions: z
      .array(z.strictObject({ id, name: text, kind: z.enum(['home', 'production']) }))
      .min(1),
    nodes: z.array(z.strictObject({ id, name: text, region: id })).min(1),
    services: z.array(
      z.strictObject({
        id,
        name: text,
        node: id,
        status: z.enum(['running', 'under-construction']),
      }),
    ),
    links: z.array(
      z.strictObject({
        from: id,
        to: id,
        kind: z.enum(['overlay', 'tunnel', 'backup', 'failover']),
      }),
    ),
    adrs: z.array(z.strictObject({ id, title: text, summary: text, url: url.optional() })),
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
  });

export const infrastructureTranslatable = ['regions.*.name', 'adrs.*.title', 'adrs.*.summary'];
