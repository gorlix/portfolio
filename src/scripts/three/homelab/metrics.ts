/*
 * Metriche e log simulati per la scena Homelab (spec §12.1: "metriche e log simulati ma credibili").
 * Tutto e generato nel browser, senza rete: modulo PURO e deterministico, derivato solo da un seme
 * numerico (niente Date.now, niente Math.random, niente DOM, niente three). Stesso seme e stesse
 * chiamate => stessi valori. I dati non descrivono infrastruttura reale.
 */

/** PRNG mulberry32: restituisce numeri in [0, 1). */
export const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Hash FNV-1a a 32 bit: serve a ricavare un seme stabile da un id di nodo. */
export const seedFrom = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** Campione di metriche: cpu e ram in percentuale (0-100), net in Mbit/s (>= 0), un decimale. */
export interface MetricSample {
  cpu: number;
  ram: number;
  net: number;
}

export interface LogTemplate {
  service: string;
  message: string;
}

export interface LogLine {
  /** HH:MM:SS dal tempo simulato. */
  time: string;
  service: string;
  message: string;
}

export interface SimulatorOptions {
  nodeIds: string[];
  seed: number;
  /** Minuto del giorno (0-1439) da cui parte il tempo simulato. */
  startMinute: number;
  templates: LogTemplate[];
  /** Secondi simulati per tick (default 30). */
  stepSeconds?: number;
}

export interface TickResult {
  minute: number;
  metrics: Record<string, MetricSample>;
  log: LogLine | null;
}

export interface Simulator {
  tick(): TickResult;
  history(nodeId: string, count: number): MetricSample[];
  shiftLoad(from: string, to: string): void;
  restoreLoad(): void;
  push(line: Omit<LogLine, 'time'>): LogLine;
}

export const HISTORY_MAX = 60;
export const HISTORY_PREFILL = 30;
const LOG_PROBABILITY = 0.6;
const DAY_SECONDS = 86400;
const IDLE_CPU = 4;
const IDLE_NET = 0.6;

const round1 = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const pad2 = (n: number): string => String(n).padStart(2, '0');

const wrapDay = (seconds: number): number =>
  ((Math.floor(seconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;

const formatTime = (seconds: number): string => {
  const s = wrapDay(seconds);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};

/** Curva giornaliera 0..1: minima di notte, massima al picco serale (ora `peakHour`). */
const dailyCurve = (seconds: number, peakHour: number): number => {
  const hour = wrapDay(seconds) / 3600;
  return 0.5 + 0.5 * Math.cos(((hour - peakHour) / 24) * 2 * Math.PI);
};

interface NodeModel {
  cpuBase: number;
  cpuAmp: number;
  ramBase: number;
  ramAmp: number;
  netBase: number;
  netAmp: number;
  peakHour: number;
  /** Deriva lenta della RAM (passeggiata con ritorno alla media). */
  ramDrift: number;
}

const buildModel = (nodeId: string, seed: number): NodeModel => {
  const rng = createRng((seedFrom(nodeId) ^ seed) >>> 0);
  return {
    cpuBase: 6 + rng() * 14,
    cpuAmp: 22 + rng() * 38,
    ramBase: 30 + rng() * 25,
    ramAmp: 6 + rng() * 12,
    netBase: 2 + rng() * 10,
    netAmp: 15 + rng() * 85,
    peakHour: 20 + (rng() - 0.5) * 3,
    ramDrift: 0,
  };
};

export const createSimulator = (options: SimulatorOptions): Simulator => {
  const { nodeIds, seed, templates } = options;
  const stepSeconds = options.stepSeconds ?? 30;
  const rng = createRng(seed);
  const models = new Map<string, NodeModel>();
  const rings = new Map<string, MetricSample[]>();
  for (const id of nodeIds) {
    models.set(id, buildModel(id, seed));
    rings.set(id, []);
  }

  let seconds = options.startMinute * 60 - HISTORY_PREFILL * stepSeconds;
  let shift: { from: string; to: string } | null = null;

  /** Carico "normale" di un nodo al tempo corrente (consuma un numero fisso di valori dal rng). */
  const sampleRaw = (id: string): MetricSample => {
    const m = models.get(id) as NodeModel;
    const curve = dailyCurve(seconds, m.peakHour);
    const noise = rng() - 0.5;
    const ramNoise = rng() - 0.5;
    const spikeRoll = rng();
    const spikeSize = rng();
    m.ramDrift = clamp(m.ramDrift * 0.97 + ramNoise * 0.8, -6, 6);
    const cpu = clamp(m.cpuBase + m.cpuAmp * curve + noise * 6, 0, 100);
    const ram = clamp(m.ramBase + m.ramAmp * curve + m.ramDrift, 0, 100);
    const spike = spikeRoll < 0.1 ? 1 + spikeSize * 3 : 1;
    const net = Math.max(0, (m.netBase + m.netAmp * curve + noise * 4) * spike);
    return { cpu, ram, net };
  };

  const step = (): Record<string, MetricSample> => {
    seconds += stepSeconds;
    const raw = new Map<string, MetricSample>();
    for (const id of nodeIds) raw.set(id, sampleRaw(id));
    const out: Record<string, MetricSample> = {};
    for (const id of nodeIds) {
      const base = raw.get(id) as MetricSample;
      let { cpu, net } = base;
      if (shift && id === shift.from) {
        cpu = IDLE_CPU + (base.cpu % 3);
        net = IDLE_NET + (base.net % 0.5);
      } else if (shift && id === shift.to) {
        const moved = raw.get(shift.from);
        if (moved) {
          cpu += moved.cpu;
          net += moved.net;
        }
      }
      const sample: MetricSample = {
        cpu: round1(clamp(cpu, 0, 100)),
        ram: round1(clamp(base.ram, 0, 100)),
        net: round1(Math.max(0, net)),
      };
      out[id] = sample;
      const ring = rings.get(id) as MetricSample[];
      ring.push(sample);
      if (ring.length > HISTORY_MAX) ring.shift();
    }
    return out;
  };

  for (let i = 0; i < HISTORY_PREFILL; i++) step();

  const stamp = (line: Omit<LogLine, 'time'>): LogLine => ({
    time: formatTime(seconds),
    service: line.service,
    message: line.message,
  });

  return {
    tick() {
      const metrics = step();
      const roll = rng();
      const pick = rng();
      let log: LogLine | null = null;
      if (templates.length > 0 && roll < LOG_PROBABILITY) {
        const tpl = templates[Math.floor(pick * templates.length)] as LogTemplate;
        log = stamp(tpl);
      }
      return { minute: Math.floor(wrapDay(seconds) / 60), metrics, log };
    },
    history(nodeId, count) {
      const ring = rings.get(nodeId) ?? [];
      const n = Math.max(0, Math.min(count, HISTORY_MAX));
      return n === 0 ? [] : ring.slice(-n).map((s) => ({ ...s }));
    },
    shiftLoad(from, to) {
      shift = { from, to };
    },
    restoreLoad() {
      shift = null;
    },
    push: stamp,
  };
};
