import { type Shot, track, trackAt } from './course';
import { heightAt, PISTE, TENNIS, TRAIL, VOLLEY } from './terrain';

/*
 * Inquadrature della montagna di Sport (PORT-88), una per momento. Logica pura, senza three.
 */

export const trailTrack = track(TRAIL);
const skiTrack = track(PISTE);

/** Inquadrature: `portrait` per gli schermi stretti. */
export const shotsFor = (portrait: boolean): Record<string, Shot> => {
  const on = (path: typeof skiTrack, t: number, height: number): Shot['target'] => {
    const p = trackAt(path, t);
    return [p.x, heightAt(p.x, p.z) + height, p.z];
  };
  const whole: Shot = {
    // In verticale la montagna scende verso il centro: meno prato vuoto sotto.
    target: [portrait ? 1 : 0, portrait ? 15 : 7, -2],
    from: [0, 0.22, 1],
    spanH: 24,
    spanW: portrait ? 44 : 66,
  };
  return {
    overview: whole,
    ski: {
      target: on(skiTrack, 0.5, 1),
      from: [0.12, 0.35, 1],
      spanH: portrait ? 15 : 22,
      spanW: portrait ? 21 : 36,
    },
    hiking: {
      target: on(trailTrack, 0.5, 1),
      from: [-0.45, 0.35, 1],
      spanH: 13,
      spanW: portrait ? 10 : 20,
    },
    tennis: {
      target: [TENNIS.x, 0.5, TENNIS.z],
      from: [-0.15, 0.7, 1],
      spanH: 9,
      spanW: portrait ? 14 : 22,
    },
    volleyball: {
      target: [VOLLEY.x, 0.5, VOLLEY.z],
      from: [0.15, 0.7, 1],
      spanH: 8,
      spanW: portrait ? 12 : 18,
    },
    exit: whole,
  };
};
