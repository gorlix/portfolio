import { createRng, seedFrom } from '../homelab/metrics';

/*
 * Sensori simulati della Domotica (PORT-80): clima per stanza, qualita dell'aria e stazione meteo
 * sul tetto. Valori domestici plausibili, non misure vere: la pagina li etichetta "dati simulati".
 * Modulo PURO e deterministico (solo un seme, niente Date.now, Math.random, DOM o three): la pagina
 * lo usa in build per il primo quadro, la scena per farlo avanzare nel browser.
 */

export interface RoomClimate {
  /** °C, un decimale. */
  temperature: number;
  /** %, intero. */
  humidity: number;
}

export interface AirQuality {
  /** ppm. */
  co2: number;
  /** Indice VOC (scala 0-500, 100 = media). */
  voc: number;
  /** µg/m³, un decimale. */
  pm25: number;
}

export interface Weather {
  /** hPa, un decimale. */
  pressure: number;
  /** °C esterni, un decimale. */
  temperature: number;
  /** % esterna, intero. */
  humidity: number;
  /** km/h, intero. */
  wind: number;
}

/** Tendenza barometrica sulle ultime tre ore simulate. */
export type Trend = 'falling' | 'steady' | 'rising';

export interface Snapshot {
  rooms: Record<string, RoomClimate>;
  air: AirQuality;
  weather: Weather;
  /** Pressione dei punti recenti (dal piu vecchio), per la sparkline. */
  pressureHistory: number[];
  trend: Trend;
}

export interface DomoticaSim {
  snapshot(): Snapshot;
  /** Avanza di un passo simulato (15 minuti) e restituisce il nuovo quadro. */
  tick(): Snapshot;
}

/** Seme unico per pagina e scena: il primo quadro in HTML e quello del 3D coincidono. */
export const SIM_SEED = seedFrom('domotica');

/** Punti tenuti per la sparkline (6 ore) e punti che fanno tre ore. */
export const HISTORY = 24;
const THREE_HOURS = 12;
/** Variazione in tre ore oltre la quale la tendenza non e piu stabile (hPa). */
export const TREND_THRESHOLD = 1;

const round = (value: number, digits = 0): number => {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
};
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function trendOf(history: readonly number[]): Trend {
  const last = history.at(-1);
  const before = history.at(-1 - THREE_HOURS) ?? history[0];
  if (last === undefined || before === undefined) return 'steady';
  const delta = last - before;
  if (delta <= -TREND_THRESHOLD) return 'falling';
  if (delta >= TREND_THRESHOLD) return 'rising';
  return 'steady';
}

export function createDomoticaSim(roomIds: readonly string[], seed: number): DomoticaSim {
  const rng = createRng(seed);
  /** Passo casuale centrato (-1..1). */
  const jitter = () => rng() * 2 - 1;
  /** Ritorno lento verso la media: i valori girano intorno a un punto credibile. */
  const walk = (value: number, mean: number, step: number, pull = 0.08) =>
    value + (mean - value) * pull + jitter() * step;

  const rooms = new Map(
    roomIds.map((id) => [
      id,
      { temperature: 19.5 + rng() * 3, humidity: 42 + rng() * 14, mean: 19.5 + rng() * 3 },
    ]),
  );
  const air = { co2: 520 + rng() * 300, voc: 80 + rng() * 60, pm25: 5 + rng() * 8 };
  const weather = { temperature: 10 + rng() * 6, humidity: 55 + rng() * 25, wind: 3 + rng() * 10 };
  // Pressione: deriva lenta in una direzione, che a volte cambia: da qui la tendenza.
  let pressure = 1008 + rng() * 14;
  let drift = jitter() * 0.25;
  const history: number[] = [];

  const step = (): void => {
    for (const room of rooms.values()) {
      room.temperature = clamp(walk(room.temperature, room.mean, 0.15), 19, 23);
      room.humidity = clamp(walk(room.humidity, 50, 1.2), 40, 60);
    }
    air.co2 = clamp(walk(air.co2, 650, 40), 420, 1100);
    air.voc = clamp(walk(air.voc, 100, 8), 40, 250);
    air.pm25 = clamp(walk(air.pm25, 8, 1), 2, 25);
    weather.temperature = clamp(walk(weather.temperature, 13, 0.3, 0.03), 4, 22);
    weather.humidity = clamp(walk(weather.humidity, 70, 2), 35, 95);
    weather.wind = clamp(walk(weather.wind, 8, 2), 0, 30);
    if (rng() < 0.04) drift = jitter() * 0.25;
    pressure = clamp(pressure + drift + (1013 - pressure) * 0.01 + jitter() * 0.08, 995, 1032);
    if (pressure <= 995 || pressure >= 1032) drift = -drift;
    history.push(pressure);
    if (history.length > HISTORY) history.shift();
  };
  for (let i = 0; i < HISTORY; i += 1) step();

  const snapshot = (): Snapshot => ({
    rooms: Object.fromEntries(
      [...rooms].map(([id, r]) => [
        id,
        { temperature: round(r.temperature, 1), humidity: round(r.humidity) },
      ]),
    ),
    air: { co2: round(air.co2), voc: round(air.voc), pm25: round(air.pm25, 1) },
    weather: {
      pressure: round(pressure, 1),
      temperature: round(weather.temperature, 1),
      humidity: round(weather.humidity),
      wind: round(weather.wind),
    },
    pressureHistory: history.map((p) => round(p, 1)),
    trend: trendOf(history),
  });

  return {
    snapshot,
    tick() {
      step();
      return snapshot();
    },
  };
}

/** Punti di una polyline SVG (viewBox 60×16) dalla storia della pressione. */
export function sparkPoints(values: readonly number[], width = 60, height = 16): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const dx = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${round(i * dx, 1)},${round(height - ((v - min) / span) * height, 1)}`)
    .join(' ');
}
