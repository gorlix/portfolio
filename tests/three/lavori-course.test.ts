import { describe, expect, it } from 'vitest';
import { type Obstacle, obstacleKinds } from '../../src/lib/schemas/experiences';
import {
  beatAt,
  buildCourse,
  type Course,
  cardFraming,
  fitDistance,
  runnerAt,
  SIDE_BY_SIDE_PX,
} from '../../src/scripts/three/lavori/course';

const levels = (...lists: Obstacle[][]) => lists.map((obstacles) => ({ obstacles }));
/** I tre livelli di oggi: Trimind, Distretto 2050, Club. */
const today = levels(
  ['container', 'firewall', 'conveyor', 'flag'],
  ['site', 'bridge', 'site'],
  ['garden'],
);

/** Il piano piu alto sotto `x` (blocchi pieni, il ponte compreso). */
const surfaceAt = (course: Course, x: number): number | null => {
  const tops = course.blocks
    .filter((b) => b.kind !== 'pole' && b.kind !== 'goal' && x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9)
    .map((b) => b.top);
  return tops.length > 0 ? Math.max(...tops) : null;
};

describe('buildCourse', () => {
  it('un momento per la prima schermata, uno per livello e uno per l uscita, in ordine', () => {
    const course = buildCourse(today);
    expect(course.anchors).toHaveLength(today.length + 2);
    course.anchors.slice(1).forEach((a, i) => {
      expect(a).toBeGreaterThan(course.anchors[i] as number);
    });
    expect(course.spans).toHaveLength(today.length);
  });

  it('i livelli si susseguono lungo +X, con un varco tra l uno e l altro', () => {
    const { spans } = buildCourse(today);
    spans.slice(1).forEach((span, i) => {
      expect(span.x0).toBeGreaterThan((spans[i] as { x1: number }).x1);
    });
  });

  it('una nuova esperienza aggiunge un livello e allunga il percorso', () => {
    const more = buildCourse([...today, { obstacles: ['platform', 'flag'] }]);
    expect(more.spans).toHaveLength(4);
    expect(more.length).toBeGreaterThan(buildCourse(today).length);
  });

  it('ogni ostacolo, da solo o in coppia con ciascun altro, produce un percorso valido', () => {
    for (const a of obstacleKinds) {
      for (const b of obstacleKinds) {
        const course = buildCourse(levels([a, b], [b]));
        for (const m of course.moves) expect(m.x1).toBeGreaterThanOrEqual(m.x0 - 1e-9);
        expect(course.anchors).toHaveLength(4);
      }
    }
  });
});

describe('runnerAt', () => {
  it('e monotono: scorrendo in giu il pinguino non torna mai indietro', () => {
    const course = buildCourse(today);
    let previous = Number.NEGATIVE_INFINITY;
    for (let s = 0; s <= today.length + 1; s += 0.01) {
      const { x } = runnerAt(course, s);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = x;
    }
  });

  it('a ogni momento e fermo, a terra, su un piano (fotogramma statico di ogni tappa)', () => {
    for (const data of [
      today,
      levels(['platform', 'flag']),
      levels(['bridge'], ['site', 'garden']),
    ]) {
      const course = buildCourse(data);
      for (let k = 0; k < course.anchors.length; k += 1) {
        const runner = runnerAt(course, k);
        expect(runner.pose).toBe(k === course.anchors.length - 1 ? 'wave' : 'stand');
        expect(surfaceAt(course, runner.x)).toBeCloseTo(runner.y, 6);
      }
    }
  });

  it('ogni momento di livello cade dentro il suo livello', () => {
    const course = buildCourse(today);
    course.spans.forEach((span, i) => {
      const { x, level } = runnerAt(course, i + 1);
      expect(level).toBe(i);
      expect(x).toBeGreaterThanOrEqual(span.x0);
      expect(x).toBeLessThanOrEqual(span.x1);
    });
  });

  it('atterra sempre su un piano: alla fine di ogni salto i piedi toccano un blocco', () => {
    const course = buildCourse(today);
    for (const m of course.moves.filter((m) => m.kind === 'jump')) {
      expect(surfaceAt(course, m.x1)).toBeCloseTo(m.y1, 6);
      expect(surfaceAt(course, m.x0)).toBeCloseTo(m.y0, 6);
    }
  });

  it('a meta salto e in aria e scavalca il muro', () => {
    const course = buildCourse(levels(['firewall']));
    const wall = course.blocks.find((b) => b.kind === 'wall');
    const jump = course.moves.find((m) => m.kind === 'jump' && m.peak > 1.5);
    expect(wall && jump).toBeTruthy();
    if (!wall || !jump) return;
    // Il pinguino passa sopra il muro con margine.
    let beat = 0;
    for (const m of course.moves) {
      if (m === jump) break;
      beat += m.beats;
    }
    const total = course.anchors.at(-1) as number;
    // Cerca la posizione del racconto che porta al centro del salto.
    let s = 0;
    while (beatAt(course, s) < beat + jump.beats / 2 && s < 3) s += 0.0005;
    const runner = runnerAt(course, s);
    expect(runner.pose).toBe('jump');
    expect(runner.y).toBeGreaterThan(wall.top + 0.2);
    expect(total).toBeGreaterThan(0);
  });

  it('e deterministico e reversibile: stessa posizione, stesso fotogramma', () => {
    const course = buildCourse(today);
    const samples = [0, 0.3, 0.77, 1, 1.5, 2.25, 3.9, 4];
    const forward = samples.map((s) => runnerAt(course, s));
    const backward = [...samples].reverse().map((s) => runnerAt(course, s));
    expect(backward.reverse()).toEqual(forward);
    expect(runnerAt(buildCourse(today), 2.25)).toEqual(runnerAt(course, 2.25));
  });

  it('fuori dall intervallo resta sulla partenza o sul saluto finale', () => {
    const course = buildCourse(today);
    expect(runnerAt(course, -5)).toEqual(runnerAt(course, 0));
    expect(runnerAt(course, 99)).toEqual(runnerAt(course, today.length + 1));
  });
});

describe('inquadratura', () => {
  it('schede a sinistra su schermo largo, percorso in alto su schermo stretto', () => {
    expect(cardFraming(SIDE_BY_SIDE_PX).shift).toBeGreaterThan(0);
    expect(cardFraming(390)).toEqual({ shift: 0, lift: expect.any(Number) });
    expect(cardFraming(390).lift).toBeGreaterThan(0);
  });

  it('fitDistance: piu stretto lo schermo, piu lontana la camera', () => {
    expect(fitDistance(4, 8, 0.5, 35)).toBeGreaterThan(fitDistance(4, 8, 1.6, 35));
  });
});
