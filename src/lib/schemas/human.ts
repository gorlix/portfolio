import { z } from 'astro/zod';
import { humanSectionIds, text } from './common';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

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
    /** Nome accessibile dell'elenco di badge: ciascuno porta alla sezione dove la competenza si vede. */
    badgesLabel: text,
    /** Avviso mostrato col poster al posto del 3D: una frase per ogni motivo del ripiego. */
    posterNotice: z.strictObject({
      webgl: text,
      savedata: text,
      error: text,
      nojs: text,
    }),
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
  /** Testo alternativo delle scene 3D. */
  scenes: z.strictObject({
    homelab: text,
    domotica: text,
    lavori: text,
    certificazioni: text,
    beneficenza: text,
    contatti: text,
    sci: text,
    tennis: text,
    pallavolo: text,
    scrivania: text,
    interessi: text,
  }),
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
    /** Controlli HTML della scena (visibili solo quando il 3D e montato). */
    explore: text,
    sceneHint: text,
    nodesLabel: text,
    layersLabel: text,
    close: text,
    noAdrs: text,
    metrics: text,
    cpu: text,
    ram: text,
    net: text,
    logs: text,
    /** Pulsante del gesto e stato annunciato (`{node}` = nome del nodo che ha il VIP). */
    failoverStart: text,
    failoverStop: text,
    failoverNormal: text,
    failoverActive: text,
    /** Equivalente testuale del gesto, sempre visibile. */
    failoverText: text,
    /** Titoli delle schede della sezione immersiva. */
    failoverTitle: text,
    projects: text,
  }),
  domotica: z.strictObject({
    projects: text,
    /** Mostrato come segnaposto finche non ci sono automazioni pubblicate. */
    automationsTodo: text,
    trigger: text,
    conditions: text,
    actions: text,
    room: text,
    /**
     * Stanze della casa della scena, in ordine di pianta. `house` e la casa intera, per le
     * automazioni che non stanno in una stanza sola. Disposizione generica, non la casa vera.
     */
    rooms: z.array(z.strictObject({ id, name: text, kind: z.enum(['room', 'house']) })).min(1),
    /** Controlli HTML della scena (visibili solo quando il 3D e montato). */
    sceneHint: text,
    roomsLabel: text,
    close: text,
    noAutomations: text,
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
  'home.badgesLabel',
  'home.posterNotice.webgl',
  'home.posterNotice.savedata',
  'home.posterNotice.error',
  'home.posterNotice.nojs',
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
  'scenes.homelab',
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
  'homelab.explore',
  'homelab.sceneHint',
  'homelab.nodesLabel',
  'homelab.layersLabel',
  'homelab.close',
  'homelab.noAdrs',
  'homelab.metrics',
  'homelab.net',
  'homelab.logs',
  'homelab.failoverStart',
  'homelab.failoverStop',
  'homelab.failoverNormal',
  'homelab.failoverActive',
  'homelab.failoverText',
  'homelab.failoverTitle',
  'homelab.projects',
  'domotica.projects',
  'domotica.automationsTodo',
  'domotica.trigger',
  'domotica.conditions',
  'domotica.actions',
  'domotica.room',
  'domotica.rooms.*.name',
  'domotica.sceneHint',
  'domotica.roomsLabel',
  'domotica.close',
  'domotica.noAutomations',
  'scenes.domotica',
  'scenes.lavori',
  'scenes.interessi',
  'scenes.certificazioni',
  'scenes.beneficenza',
  'scenes.contatti',
  'scenes.sci',
  'scenes.tennis',
  'scenes.pallavolo',
  'scenes.scrivania',
];
