/**
 * Percorsi che devono funzionare e restare leggeri senza JavaScript (spec §2): ingresso,
 * recruiter, agent, nelle due lingue.
 */

export const lightRoutes = ['/', '/en/', '/recruiter/', '/en/recruiter/', '/agent/', '/en/agent/'];

/** Percorsi dove JS/3D sono ammessi: ancora nessuno, `/human/` arriva con la fase 3D. */
export const heavyRoutes: string[] = [];
