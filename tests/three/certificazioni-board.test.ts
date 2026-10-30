import { describe, expect, it } from 'vitest';
import {
  BIG,
  type BoardData,
  buildBoard,
  clipBand,
  hexagon,
  hexRing,
  prism,
  SMALL,
  viewOf,
} from '../../src/scripts/three/certificazioni/board';
import { SIDE_BY_SIDE_PX } from '../../src/scripts/three/framing';

const data: BoardData = {
  technical: [
    { slug: 'rhcsa', status: 'in-progress' },
    { slug: 'cka', status: 'in-progress', scenery: 'cluster' },
  ],
  supplementary: [
    { slug: 'a', status: 'earned' },
    { slug: 'b', status: 'earned' },
    { slug: 'c', status: 'earned' },
    { slug: 'd', status: 'earned' },
  ],
};

describe('bacheca', () => {
  it('uno slot per certificazione: lo stato decide costruzione o pieno', () => {
    const board = buildBoard(data);
    const by = (slug: string) => board.slots.find((s) => s.slug === slug);
    expect(by('rhcsa')?.state).toBe('building');
    expect(by('cka')?.state).toBe('building');
    expect(by('a')?.state).toBe('full');
    expect(by('rhcsa')?.radius).toBe(BIG);
    expect(by('a')?.radius).toBe(SMALL);
  });

  it('una certificazione ottenuta diventa piena senza toccare il codice', () => {
    const board = buildBoard({
      ...data,
      technical: [{ slug: 'rhcsa', status: 'earned' }],
    });
    expect(board.slots.find((s) => s.slug === 'rhcsa')?.state).toBe('full');
  });

  it('i cubi stanno accanto al loro esagono, senza sovrapporsi a uno slot', () => {
    const board = buildBoard(data);
    expect(board.clusters).toHaveLength(1);
    const cluster = board.clusters[0];
    for (const slot of board.slots.filter((s) => s.radius === BIG)) {
      expect(Math.abs(slot.x - (cluster?.x ?? 0))).toBeGreaterThan(2);
    }
  });

  it('resta sempre almeno uno slot libero e tutto sta sulla parete', () => {
    const board = buildBoard({ ...data, technical: Array(7).fill(data.technical[0]) });
    expect(board.slots.some((s) => s.slug === '')).toBe(true);
    for (const slot of board.slots) {
      expect(Math.abs(slot.x) + slot.radius).toBeLessThan(board.halfWidth);
      expect(slot.y + slot.radius).toBeLessThan(board.top);
      expect(slot.y - slot.radius).toBeGreaterThan(board.floor);
    }
  });

  it('il pinguino non copre la fila dei badge piccoli', () => {
    const board = buildBoard(data);
    const small = board.slots.filter((s) => s.radius === SMALL);
    const right = Math.max(...small.map((s) => s.x + s.radius));
    expect(board.penguin.x - 1).toBeGreaterThan(right);
  });
});

describe('inquadrature', () => {
  const board = buildBoard(data);

  it('ogni scheda ha il soggetto a destra su schermo largo, in alto su quello stretto', () => {
    expect(viewOf('rhcsa', board, SIDE_BY_SIDE_PX, 800).shift).toBeGreaterThan(0);
    expect(viewOf('rhcsa', board, 390, 844).lift).toBeGreaterThan(0);
    expect(viewOf('others', board, 390, 844).lift).toBeGreaterThan(0);
  });

  it('zoom sulle schede, vista larga su prima schermata e uscita', () => {
    const zoom = viewOf('rhcsa', board, 1440, 900).spanW;
    expect(viewOf('overview', board, 1440, 900).spanW).toBeGreaterThan(zoom);
    expect(viewOf('exit', board, 1440, 900).spanW).toBeGreaterThan(zoom);
  });

  it('nelle schede il pinguino resta fuori campo, mai tagliato', () => {
    for (const name of ['rhcsa', 'cka', 'others']) {
      const view = viewOf(name, board, 1440, 900);
      // Il centro dell'inquadratura sta al 72,5% della larghezza: a destra resta il 27,5%.
      expect(board.penguin.x - 0.6).toBeGreaterThan(view.x + view.spanW * 0.275);
    }
  });

  it('con i cubi accanto inquadra la coppia, non solo esagono', () => {
    const cka = board.slots.find((s) => s.slug === 'cka');
    expect(viewOf('cka', board, 1440, 900).x).toBeGreaterThan(cka?.x ?? 0);
  });
});

describe('solidi', () => {
  it('esagono con la punta in alto', () => {
    const top = hexagon(2)[0];
    expect(top?.[0]).toBeCloseTo(0);
    expect(top?.[1]).toBeCloseTo(2);
  });

  it('clipBand tiene solo la fascia chiesta', () => {
    const half = clipBand(hexagon(1), -2, 0);
    expect(Math.max(...half.map(([, y]) => y))).toBeCloseTo(0);
    expect(Math.min(...half.map(([, y]) => y))).toBeCloseTo(-1);
  });

  it('prism e hexRing producono triangoli interi, con le facce davanti verso +Z', () => {
    const triangles = prism(hexagon(1), 0, 1);
    expect(triangles.length % 9).toBe(0);
    expect(hexRing(1, 0.8, 0, 1).length % 9).toBe(0);
    // Triangolo con tutti i vertici davanti: antiorario visto da +Z.
    const fan = triangles.findIndex(
      (_, i) => i % 9 === 0 && [2, 5, 8].every((k) => triangles[i + k] === 1),
    );
    const [ax = 0, ay = 0, , bx = 0, by = 0, , cx = 0, cy = 0] = triangles.slice(fan, fan + 9);
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    expect(cross).toBeGreaterThan(0);
  });
});
