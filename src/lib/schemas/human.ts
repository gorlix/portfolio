import { z } from 'astro/zod';
import { humanSectionIds, text } from './common';

const sectionTexts = z.strictObject(
  Object.fromEntries(humanSectionIds.map((id) => [id, text])) as Record<
    (typeof humanSectionIds)[number],
    typeof text
  >,
);

/** Copy della pagina `/human`: i componenti non contengono testo. Tono provvisorio, prima persona. */
export const humanSchema = z.strictObject({
  /** Dopo il nome nel `<title>`. */
  titleSuffix: text,
  metaDescription: text,
  /** Nome accessibile dell'elenco di link con le sezioni (barra del tempo). */
  menuLabel: text,
  /** Pulsante che apre l'elenco delle tappe su mobile. */
  menuToggle: text,
  /** Link discreto e persistente verso la scelta del percorso (`/`). */
  backToChoice: text,
  homeTitle: text,
  home: z.strictObject({
    greeting: text,
    scrollHint: text,
    /** Spazio riservato all'avatar low-poly (il modello arriva nelle fasi 3D). */
    avatarLabel: text,
    /** Nome accessibile dell'elenco di badge: ciascuno porta alla sezione dove la competenza si vede. */
    badgesLabel: text,
  }),
  /** Frase d'apertura di ogni sezione, in prima persona. */
  intros: sectionTexts,
  /** Etichetta del segnaposto per i dati non ancora forniti. */
  todoLabel: text,
  labels: z.strictObject({
    ongoing: text,
    results: text,
    stack: text,
    issuer: text,
    verify: text,
    technicalCertifications: text,
    supplementaryCertifications: text,
    repository: text,
    language: text,
    email: text,
    profiles: text,
    cv: text,
  }),
  /** Testo alternativo delle scene 3D (oggi solo il segnaposto). */
  scenes: z.strictObject({ placeholder: text }),
  homelab: z.strictObject({
    caption: text,
    simulatedNote: text,
    region: text,
    node: text,
    services: text,
    underConstruction: text,
    decisions: text,
    backup: text,
    backupIntro: text,
    cloud: text,
    local: text,
    offsite: text,
    onsite: text,
    wip: text,
  }),
  domotica: z.strictObject({
    projects: text,
    /** Mostrato come segnaposto finche non ci sono automazioni pubblicate. */
    automationsTodo: text,
    trigger: text,
    conditions: text,
    actions: text,
  }),
  /** Chiusura del percorso: saluto in stile terminale e ritorno alla scelta. */
  farewell: z.strictObject({ command: text, message: text }),
});

export const humanTranslatable = [
  'titleSuffix',
  'metaDescription',
  'menuLabel',
  'menuToggle',
  'backToChoice',
  'homeTitle',
  'home.greeting',
  'home.scrollHint',
  'home.avatarLabel',
  'home.badgesLabel',
  ...humanSectionIds.map((id) => `intros.${id}`),
  'labels.ongoing',
  'labels.results',
  'labels.stack',
  'labels.issuer',
  'labels.verify',
  'labels.technicalCertifications',
  'labels.supplementaryCertifications',
  'labels.repository',
  'labels.language',
  'labels.email',
  'labels.profiles',
  'labels.cv',
  'scenes.placeholder',
  'farewell.message',
  'homelab.caption',
  'homelab.simulatedNote',
  'homelab.region',
  'homelab.node',
  'homelab.services',
  'homelab.underConstruction',
  'homelab.decisions',
  'homelab.backup',
  'homelab.backupIntro',
  'homelab.cloud',
  'homelab.local',
  'homelab.offsite',
  'homelab.onsite',
  'homelab.wip',
  'domotica.projects',
  'domotica.automationsTodo',
  'domotica.trigger',
  'domotica.conditions',
  'domotica.actions',
];
