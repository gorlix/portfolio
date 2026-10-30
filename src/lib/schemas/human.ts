import { z } from 'astro/zod';
import { humanSectionIds, text, url } from './common';
import { openSourceGroups } from './projects';

/** Oggetti della scrivania con un popup, nell'ordine dell'elenco. */
export const hardwareIds = [
  'printer',
  'trackball',
  'moonlander',
  'monitor',
  'server',
  'window',
] as const;

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
    /** Cosa mostra il poster della sezione, inserito in `posterNotice` al posto di `{subject}`. */
    posterSubject: text,
    /** Hardware sulla scrivania (PORT-84): elenco accessibile e popup sugli oggetti della scena. */
    hardwareTitle: text,
    hardwareLabel: text,
    hardwareHint: text,
    hardware: z
      .array(
        z.strictObject({
          /** Collega la voce all'oggetto con lo stesso nome nella scena (scrivania.ts). */
          id: z.enum(hardwareIds),
          name: text,
          text,
          url: url.optional(),
          linkLabel: text.optional(),
        }),
      )
      .length(hardwareIds.length),
  }),
  /**
   * Avviso mostrato col poster al posto del 3D, comune alle sezioni immersive: una frase per ogni
   * motivo del ripiego; `{subject}` = `posterSubject` della sezione (es. "della scrivania").
   */
  posterNotice: z.strictObject({
    webgl: text,
    savedata: text,
    error: text,
    nojs: text,
  }),
  /** Frase d'apertura di ogni sezione, in prima persona. */
  intros: sectionTexts,
  labels: z.strictObject({
    ongoing: text,
    results: text,
    stack: text,
    issuer: text,
    verify: text,
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
    sport: text,
    scrivania: text,
    interessi: text,
    trimind: text,
    opensource: text,
  }),
  /** Sezione Lavori ad albero (PORT-81): schede in stile CV, una per foglia. */
  work: z.strictObject({
    /** Pulsante verso la pagina di approfondimento; `{company}` nel nome accessibile. */
    deeper: text,
    deeperLabel: text,
    /** Marca delle esperienze di volontariato. */
    volunteer: text,
    /** Titolo dei 2-3 punti del CV mostrati nella scheda. */
    highlights: text,
    posterSubject: text,
    /** Ultima tappa dei Lavori (PORT-89): rimanda alla pagina Open source, non e un'esperienza. */
    openSource: z.strictObject({
      title: text,
      summary: text,
    }),
  }),
  /** Pagina Open source (PORT-89): i repository stanno nei progetti, qui i connettivi. */
  openSource: z.strictObject({
    titleSuffix: text,
    metaDescription: text,
    /** Titolo della sezione (dopo `~/lavori/`). */
    heading: text,
    eyebrow: text,
    intro: text,
    /** Link di ritorno ai Lavori (intestazione e fine pagina). */
    back: text,
    scrollHint: text,
    posterSubject: text,
    /** Da dove vengono le stelle: sono lette quando il sito viene pubblicato. */
    starsNote: text,
    /** `{n}`: nome accessibile delle stelle. */
    starsLabel: text,
    /** Marca dei repository di altri a cui ho contribuito. */
    contribution: text,
    /** `{n}` e `{total}`: indicatore del momento nella scheda. */
    step: text,
    /** Un gruppo per quartiere, nell'ordine in cui il pinguino li attraversa. */
    groups: z
      .array(
        z.strictObject({
          id: z.enum(openSourceGroups),
          title: text,
          lead: text,
        }),
      )
      .min(1),
  }),
  /** Bacheca delle Certificazioni (PORT-87): stato e data nelle schede. */
  certifications: z.strictObject({
    earned: text,
    /** Davanti alla data prevista di una certificazione in corso. */
    expected: text,
    posterSubject: text,
  }),
  /** Sezione Sport immersiva (PORT-88): la grande montagna; le schede sono i topic `sport`. */
  sport: z.strictObject({
    posterSubject: text,
  }),
  /** Sezione Interessi immersiva (PORT-92): il banco; le schede sono i topic `interessi`. */
  interessi: z.strictObject({
    posterSubject: text,
  }),
  /** Pagina di approfondimento Trimind (PORT-82): connettivi provvisori, i fatti stanno nel CV. */
  trimind: z.strictObject({
    titleSuffix: text,
    metaDescription: text,
    /** Sopra il titolo della prima schermata. */
    eyebrow: text,
    intro: text,
    /** Link di ritorno all'albero dei Lavori (intestazione e fine pagina). */
    back: text,
    scrollHint: text,
    posterSubject: text,
    simulatedNote: text,
    /** `{n}` e `{total}`: indicatore del momento nella scheda. */
    step: text,
    /**
     * Una scheda per momento della scena: `results` sono gli indici (da 0) dei punti del CV di
     * Trimind raccontati nella scheda; `stack` aggiunge lo stack dell'esperienza.
     */
    moments: z
      .array(
        z.strictObject({
          id: z.enum(['infra', 'backup', 'cicd', 'observability', 'quality']),
          title: text,
          lead: text,
          results: z.array(z.number().int().min(0)).min(1),
          stack: z.boolean().default(false),
        }),
      )
      .length(5),
    /**
     * Quantita del CV che la scena disegna (servizi, repository, giorni di retention, test,
     * provider LLM): forme generiche, nessun nome o dato reale dell'infrastruttura.
     */
    figures: z.strictObject({
      services: z.number().int().positive(),
      repositories: z.number().int().positive(),
      retentionDays: z.number().int().positive(),
      tests: z.number().int().positive(),
      providers: z.number().int().positive(),
    }),
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
    posterSubject: text,
    /** Etichetta dei valori dei sensori, che sono simulati finche non arrivano dati veri. */
    simulatedNote: text,
    /** Schede della sezione immersiva: clima per stanza, audio multi-room, aria e meteo. */
    climate: z.strictObject({ title: text, text, temperature: text, humidity: text }),
    audio: z.strictObject({ title: text, text, rooms: text }),
    weather: z.strictObject({
      title: text,
      text,
      air: text,
      co2: text,
      voc: text,
      pm25: text,
      station: text,
      pressure: text,
      outdoorTemperature: text,
      outdoorHumidity: text,
      wind: text,
      /** Stima del tempo dall'andamento della pressione nelle ultime tre ore. */
      trendLabel: text,
      falling: text,
      steady: text,
      rising: text,
    }),
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
  'home.posterSubject',
  'home.hardwareTitle',
  'home.hardwareLabel',
  'home.hardwareHint',
  'home.hardware.*.name',
  'home.hardware.*.text',
  'home.hardware.*.linkLabel',
  'posterNotice.webgl',
  'posterNotice.savedata',
  'posterNotice.error',
  'posterNotice.nojs',
  ...humanSectionIds.map((id) => `intros.${id}`),
  'labels.ongoing',
  'labels.results',
  'labels.stack',
  'labels.issuer',
  'labels.verify',
  'labels.supplementaryCertifications',
  'labels.repository',
  'labels.language',
  'labels.email',
  'labels.profiles',
  'labels.cv',
  'scenes.homelab',
  'scenes.trimind',
  'scenes.opensource',
  'work.deeper',
  'work.deeperLabel',
  'work.volunteer',
  'work.highlights',
  'work.posterSubject',
  'work.openSource.title',
  'work.openSource.summary',
  'openSource.titleSuffix',
  'openSource.metaDescription',
  'openSource.heading',
  'openSource.eyebrow',
  'openSource.intro',
  'openSource.back',
  'openSource.scrollHint',
  'openSource.posterSubject',
  'openSource.starsNote',
  'openSource.starsLabel',
  'openSource.contribution',
  'openSource.step',
  'openSource.groups.*.title',
  'openSource.groups.*.lead',
  'certifications.earned',
  'certifications.expected',
  'certifications.posterSubject',
  'trimind.titleSuffix',
  'trimind.metaDescription',
  'trimind.eyebrow',
  'trimind.intro',
  'trimind.back',
  'trimind.scrollHint',
  'trimind.posterSubject',
  'trimind.simulatedNote',
  'trimind.step',
  'trimind.moments.*.title',
  'trimind.moments.*.lead',
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
  'domotica.trigger',
  'domotica.conditions',
  'domotica.actions',
  'domotica.room',
  'domotica.rooms.*.name',
  'domotica.sceneHint',
  'domotica.roomsLabel',
  'domotica.close',
  'domotica.noAutomations',
  'domotica.posterSubject',
  'domotica.simulatedNote',
  'domotica.climate.title',
  'domotica.climate.text',
  'domotica.climate.temperature',
  'domotica.climate.humidity',
  'domotica.audio.text',
  'domotica.audio.rooms',
  'domotica.weather.title',
  'domotica.weather.text',
  'domotica.weather.air',
  'domotica.weather.voc',
  'domotica.weather.station',
  'domotica.weather.pressure',
  'domotica.weather.outdoorTemperature',
  'domotica.weather.outdoorHumidity',
  'domotica.weather.wind',
  'domotica.weather.trendLabel',
  'domotica.weather.falling',
  'domotica.weather.steady',
  'domotica.weather.rising',
  'scenes.domotica',
  'scenes.lavori',
  'scenes.interessi',
  'scenes.certificazioni',
  'scenes.beneficenza',
  'scenes.contatti',
  'scenes.sport',
  'sport.posterSubject',
  'interessi.posterSubject',
  'scenes.scrivania',
];
