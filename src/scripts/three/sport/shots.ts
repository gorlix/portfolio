import { type Shot, track, trackAt } from './course';
import { heightAt, TENNIS, TRAIL, VOLLEY } from './terrain';

/*
 * Inquadrature della montagna di Sport (PORT-88), una per momento. Logica pura, senza three.
 */

export const trailTrack = track(TRAIL);

/** Inquadrature: `portrait` per gli schermi stretti. */
export const shotsFor = (portrait: boolean): Record<string, Shot> => {
  const mid = (t: number, height: number): Shot['target'] => {
    const p = trackAt(trailTrack, t);
    return [p.x, heightAt(p.x, p.z) + height, p.z];
  };
  const whole: Shot = {
    target: [0, 7, -2],
    from: [0, 0.22, 1],
    spanH: 24,
    spanW: portrait ? 42 : 66,
  };
  return {
    overview: whole,
    ski: {
      target: [0, heightAt(0, 7) + 1, 7],
      from: [0.2, 0.4, 1],
      spanH: 15,
      spanW: portrait ? 11 : 22,
    },
    hiking: {
      target: mid(0.5, 1),
      from: [-0.45, 0.35, 1],
      spanH: 13,
      spanW: portrait ? 10 : 20,
    },
    tennis: {
      target: [TENNIS.x, 0.5, TENNIS.z],
      from: [-0.15, 0.7, 1],
      spanH: 9,
      spanW: portrait ? 13 : 18,
    },
    volleyball: {
      target: [VOLLEY.x, 0.5, VOLLEY.z],
      from: [0.15, 0.7, 1],
      spanH: 8,
      spanW: portrait ? 11 : 16,
    },
    exit: whole,
  };
};
