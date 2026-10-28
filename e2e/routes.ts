/**
 * Percorsi che devono funzionare e restare leggeri senza JavaScript (spec §2): ingresso,
 * recruiter, agent, nelle due lingue.
 */

export const lightRoutes = ['/', '/en/', '/recruiter/', '/en/recruiter/', '/agent/', '/en/agent/'];

/** Percorsi dove JS/3D sono ammessi (spec §2): il percorso Umano, nelle due lingue. */
export const heavyRoutes = [
  '/human/',
  '/en/human/',
  '/human/lavori/trimind/',
  '/en/human/lavori/trimind/',
];
