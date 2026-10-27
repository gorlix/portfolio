import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRng,
  createSimulator,
  type LogTemplate,
  seedFrom,
} from '../../src/scripts/three/homelab/metrics';

const nodeIds = ['alpha', 'beta', 'gamma'];
const templates: LogTemplate[] = [
  { service: 'proxy', message: 'richiesta servita' },
  { service: 'backup', message: 'snapshot completato' },
  { service: 'dns', message: 'cache aggiornata' },
];

const make = (seed = 42, startMinute = 8 * 60) =>
  createSimulator({ nodeIds, seed, startMinute, templates });

const avg = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createRng e seedFrom', () => {
  it('stesso seme: stessa sequenza, valori in [0,1)', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seedFrom e stabile e distingue gli id', () => {
    expect(seedFrom('alpha')).toBe(seedFrom('alpha'));
    expect(seedFrom('alpha')).not.toBe(seedFrom('beta'));
  });
});

describe('createSimulator', () => {
  it('deterministico: stesso seme, stessa sequenza di 50 tick', () => {
    const a = make();
    const b = make();
    for (let i = 0; i < 50; i++) expect(a.tick()).toEqual(b.tick());
  });

  it('seme diverso: sequenza diversa', () => {
    const a = make(1);
    const b = make(2);
    const ticksA = Array.from({ length: 50 }, () => a.tick().metrics);
    const ticksB = Array.from({ length: 50 }, () => b.tick().metrics);
    expect(ticksA).not.toEqual(ticksB);
  });

  it('valori nei range: cpu e ram 0-100 con un decimale, net >= 0', () => {
    const sim = make();
    for (let i = 0; i < 2880; i++) {
      for (const sample of Object.values(sim.tick().metrics)) {
        for (const v of [sample.cpu, sample.ram, sample.net]) {
          expect(Math.round(v * 10) / 10).toBe(v);
        }
        expect(sample.cpu).toBeGreaterThanOrEqual(0);
        expect(sample.cpu).toBeLessThanOrEqual(100);
        expect(sample.ram).toBeGreaterThanOrEqual(0);
        expect(sample.ram).toBeLessThanOrEqual(100);
        expect(sample.net).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('curva giornaliera: CPU media 19-22 maggiore di quella 03-05', () => {
    const sim = make(42, 0);
    const night: number[] = [];
    const evening: number[] = [];
    for (let i = 0; i < 2880; i++) {
      const { minute, metrics } = sim.tick();
      const h = minute / 60;
      const cpu = avg(Object.values(metrics).map((s) => s.cpu));
      if (h >= 3 && h < 5) night.push(cpu);
      if (h >= 19 && h < 22) evening.push(cpu);
    }
    expect(night.length).toBeGreaterThan(0);
    expect(evening.length).toBeGreaterThan(0);
    expect(avg(evening)).toBeGreaterThan(avg(night));
  });

  it('minuto simulato avanza di stepSeconds e fa il giro del giorno', () => {
    const sim = createSimulator({
      nodeIds,
      seed: 1,
      startMinute: 1439,
      templates,
      stepSeconds: 60,
    });
    expect(sim.tick().minute).toBe(0);
    expect(sim.tick().minute).toBe(1);
  });

  it('log: circa il 60% dei tick, orario HH:MM:SS, dai template', () => {
    const sim = make();
    let count = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const { log } = sim.tick();
      if (log) {
        count++;
        expect(log.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(templates.some((t) => t.service === log.service && t.message === log.message)).toBe(
          true,
        );
      }
    }
    expect(count / total).toBeGreaterThan(0.5);
    expect(count / total).toBeLessThan(0.7);
  });

  it('history: 30 campioni precompilati, massimo 60, ultimi count', () => {
    const sim = make();
    expect(sim.history('alpha', 100)).toHaveLength(30);
    for (let i = 0; i < 100; i++) sim.tick();
    expect(sim.history('alpha', 100)).toHaveLength(60);
    expect(sim.history('alpha', 10)).toHaveLength(10);
    expect(sim.history('nessuno', 10)).toEqual([]);
  });

  it('history: l ultimo campione coincide con l ultimo tick', () => {
    const sim = make();
    const { metrics } = sim.tick();
    expect(sim.history('beta', 1)).toEqual([metrics.beta]);
  });

  it('shiftLoad: il nodo origine va a riposo, la destinazione assorbe il carico', () => {
    const run = (shifted: boolean) => {
      const sim = make(5, 20 * 60);
      if (shifted) sim.shiftLoad('alpha', 'beta');
      const from: number[] = [];
      const to: number[] = [];
      for (let i = 0; i < 40; i++) {
        const { metrics } = sim.tick();
        from.push(metrics.alpha?.cpu ?? 0);
        to.push(metrics.beta?.cpu ?? 0);
      }
      return { from: avg(from), to: avg(to) };
    };
    const normal = run(false);
    const failover = run(true);
    expect(failover.from).toBeLessThan(10);
    expect(failover.from).toBeLessThan(normal.from);
    expect(failover.to).toBeGreaterThan(normal.to);
  });

  it('restoreLoad: torna ai valori normali', () => {
    const sim = make(5, 20 * 60);
    sim.shiftLoad('alpha', 'beta');
    sim.tick();
    sim.restoreLoad();
    const after = Array.from({ length: 20 }, () => sim.tick().metrics.alpha?.cpu ?? 0);
    expect(avg(after)).toBeGreaterThan(15);
  });

  it('push: riga con orario simulato corrente', () => {
    const sim = createSimulator({
      nodeIds,
      seed: 3,
      startMinute: 12 * 60 + 5,
      templates,
      stepSeconds: 30,
    });
    expect(sim.push({ service: 'ha', message: 'failover avviato' })).toEqual({
      time: '12:05:00',
      service: 'ha',
      message: 'failover avviato',
    });
    sim.tick();
    expect(sim.push({ service: 'ha', message: 'ok' }).time).toBe('12:05:30');
  });

  it('non usa Math.random ne fetch', () => {
    const random = vi.spyOn(Math, 'random');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const sim = make();
    sim.shiftLoad('alpha', 'beta');
    for (let i = 0; i < 50; i++) sim.tick();
    sim.push({ service: 'x', message: 'y' });
    expect(random).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
