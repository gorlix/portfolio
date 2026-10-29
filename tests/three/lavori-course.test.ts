import { describe, expect, it } from 'vitest';
import { type Scenery, sceneryKinds } from '../../src/lib/schemas/experiences';
import {
  buildCourse,
  type Course,
  cardFraming,
  fitDistance,
  HOP_HEIGHT,
  runnerAt,
  SIDE_BY_SIDE_PX,
} from '../../src/scripts/three/lavori/course';

const levels = (...lists: Scenery[][]) => lists.map((scenery) => ({ scenery }));
/** I tre livelli di oggi: Trimind, Distretto 2050, Club. */
const today = levels(
  ['container', 'firewall', 'conveyor', 'flag'],
  ['site', 'bridge', 'site'],
  ['garden'],
);

/** C'e strada sotto `x`? */
const onRoad = (course: Course, x: number): boolean =>
  course.strips.some((s) => x >= s.x0 - 1e-9 && x <= s.x1 + 1e-9);

/** Posizioni del racconto da 0 all'uscita, fitte. */
const samples = (course: Course, step = 0.005): number[] =>
  Array.from({ length: Math.round((course.anchors.length - 1) / step) + 1 }, (_, i) => i * step);

describe('buildCourse', () => {
  it('un momento per la prima schermata, uno per livello e uno per l uscita, in ordine', () => {
    const course = buildCourse(today);
    expect(course.anchors).toHaveLength(today.length + 2);
    course.anchors.slice(1).forEach((a, i) => {
      expect(a).toBeGreaterThan(course.anchors[i] as number);
    });
  });

  it('una striscia di strada per livello, in fila lungo +X con un varco tra l una e l altra', () => {
    const { strips, spans } = buildCourse(today);
    expect(spans).toHaveLength(today.length);
    strips.slice(1).forEach((strip, i) => {
      expect(strip.x0).toBeGreaterThan((strips[i] as { x1: number }).x1);
    });
  });

  it('la scenografia sta dentro il suo livello, un oggetto per voce dei dati', () => {
    const course = buildCourse(today);
    course.spans.forEach((span, i) => {
      const own = course.props.filter((p) => p.level === i);
      expect(own.map((p) => p.kind)).toEqual(today[i]?.scenery);
      for (const p of own) {
        expect(p.x).toBeGreaterThan(span.x0);
        expect(p.x).toBeLessThan(span.x1);
      }
    });
  });

  it('una nuova esperienza aggiunge un livello e allunga il percorso', () => {
    const more = buildCourse([...today, { scenery: ['flag'] }]);
    expect(more.spans).toHaveLength(4);
    expect(more.length).toBeGreaterThan(buildCourse(today).length);
  });

  it('regge ogni tipo di scenografia, da solo e in coppia', () => {
    for (const a of sceneryKinds) {
      for (const b of sceneryKinds) {
        const course = buildCourse(levels([a, b], [b]));
        expect(course.anchors).toHaveLength(4);
      }
    }
  });
});

describe('runnerAt', () => {
  const course = buildCourse(today);

  it('e monotono: scorrendo in giu il pinguino non torna mai indietro', () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (const s of samples(course)) {
      const { x } = runnerAt(course, s);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = x;
    }
  });

  it('cammina sempre sulla strada; si stacca da terra solo nei varchi, poco e mai sopra la strada', () => {
    for (const s of samples(course)) {
      const runner = runnerAt(course, s);
      if (runner.y > 0) {
        expect(runner.pose).toBe('jump');
        expect(runner.y).toBeLessThanOrEqual(HOP_HEIGHT + 1e-9);
      } else {
        expect(onRoad(course, runner.x)).toBe(true);
      }
    }
  });

  it('a ogni momento e fermo a terra, dentro il suo livello; all uscita saluta', () => {
    for (let k = 0; k < course.anchors.length; k += 1) {
      const runner = runnerAt(course, k);
      expect(runner.y).toBe(0);
      expect(runner.pose).toBe(k === course.anchors.length - 1 ? 'wave' : 'stand');
      const span = course.spans[k - 1];
      if (span) {
        expect(runner.level).toBe(k - 1);
        expect(runner.x).toBeGreaterThan(span.x0);
        expect(runner.x).toBeLessThan(span.x1);
      }
    }
  });

  it('attorno a ogni scheda resta fermo: piccoli scroll non lo muovono', () => {
    for (let k = 1; k < course.anchors.length - 1; k += 1) {
      expect(runnerAt(course, k - 0.1)).toEqual(runnerAt(course, k));
      expect(runnerAt(course, k + 0.1)).toEqual(runnerAt(course, k));
    }
  });

  it('il saltello cade a meta strada tra due schede, mai vicino a una scheda', () => {
    for (const s of samples(course)) {
      if (runnerAt(course, s).pose !== 'jump') continue;
      const fraction = s - Math.floor(s);
      expect(fraction).toBeGreaterThan(0.15);
      expect(fraction).toBeLessThan(0.85);
    }
  });

  it('e deterministico e reversibile: stessa posizione, stesso fotogramma', () => {
    const points = [0, 0.3, 0.77, 1, 1.5, 2.25, 3.9, 4];
    const forward = points.map((s) => runnerAt(course, s));
    const backward = [...points].reverse().map((s) => runnerAt(course, s));
    expect(backward.reverse()).toEqual(forward);
    expect(runnerAt(buildCourse(today), 2.25)).toEqual(runnerAt(course, 2.25));
  });

  it('fuori dall intervallo resta sulla partenza o sul saluto finale', () => {
    expect(runnerAt(course, -5)).toEqual(runnerAt(course, 0));
    expect(runnerAt(course, 99)).toEqual(runnerAt(course, today.length + 1));
  });
});

describe('inquadratura', () => {
  it('schede a sinistra su schermo largo, strada in alto su schermo stretto', () => {
    expect(cardFraming(SIDE_BY_SIDE_PX).shift).toBeGreaterThan(0);
    expect(cardFraming(390)).toEqual({ shift: 0, lift: expect.any(Number) });
    expect(cardFraming(390).lift).toBeGreaterThan(0);
  });

  it('fitDistance: piu stretto lo schermo, piu lontana la camera', () => {
    expect(fitDistance(4, 8, 0.5, 35)).toBeGreaterThan(fitDistance(4, 8, 1.6, 35));
  });
});
