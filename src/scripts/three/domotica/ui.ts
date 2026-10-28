import { type Snapshot, sparkPoints } from './sim';

/*
 * Valori simulati nelle schede della Domotica (clima, aria, meteo). La pagina li rende gia in build
 * con lo stesso seme (primo quadro, valido anche senza JS); qui si aggiornano mentre la scena anima.
 * Markup: `[data-sim="rooms.camera.temperature"]` (percorso nel quadro, `data-digits` decimali),
 * `[data-sim-spark] polyline` per la pressione, `[data-trend]` per la frase della tendenza.
 * Nessuna regione live: i numeri cambiano spesso e non vanno annunciati. Nessuna dipendenza da three.
 */

export interface SimUi {
  show(snapshot: Snapshot): void;
}

const pick = (snapshot: Snapshot, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      snapshot,
    );

export function bindSimUi(container: HTMLElement): SimUi {
  const root = container.closest('section');
  if (!root) return { show: () => {} };
  const values = [...root.querySelectorAll<HTMLElement>('[data-sim]')];
  const spark = root.querySelector<SVGPolylineElement>('[data-sim-spark] polyline');
  const trends = [...root.querySelectorAll<HTMLElement>('[data-trend]')];
  const locale = document.documentElement.lang || undefined;
  const formats = new Map<number, Intl.NumberFormat>();
  const format = (value: number, digits: number): string => {
    let f = formats.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      formats.set(digits, f);
    }
    return f.format(value);
  };

  return {
    show(snapshot) {
      for (const el of values) {
        const value = pick(snapshot, el.dataset.sim ?? '');
        if (typeof value === 'number')
          el.textContent = format(value, Number(el.dataset.digits ?? 0));
      }
      spark?.setAttribute('points', sparkPoints(snapshot.pressureHistory));
      for (const el of trends) el.hidden = el.dataset.trend !== snapshot.trend;
    },
  };
}
