import type { Shot } from '../framing';
import { track, trackAt } from './course';
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
  // Schermo stretto: inquadrature piu strette e piu dall'alto, il terreno riempie anche il fondo.
  if (portrait) {
    const whole: Shot = { target: [1, 19, -2], from: [0, 0.22, 1], spanH: 24, spanW: 32 };
    const courts: Shot['target'] = [TENNIS.x, 0.5, (TENNIS.z + VOLLEY.z) / 2];
    return {
      overview: whole,
      ski: { target: on(skiTrack, 0.5, 0), from: [0.1, 0.8, 1], spanH: 15, spanW: 19 },
      hiking: { target: on(trailTrack, 0.5, 1), from: [-0.3, 0.9, 1], spanH: 13, spanW: 14 },
      // I due campi stanno insieme sopra la scheda, mai coperti.
      tennis: { target: courts, from: [-0.05, 1.1, 1], spanH: 9, spanW: 21 },
      volleyball: { target: courts, from: [0.05, 1.1, 1], spanH: 9, spanW: 20 },
      exit: whole,
    };
  }
  const whole: Shot = { target: [0, 7, -2], from: [0, 0.22, 1], spanH: 24, spanW: 66 };
  return {
    overview: whole,
    ski: { target: on(skiTrack, 0.5, 1), from: [0.12, 0.35, 1], spanH: 22, spanW: 36 },
    hiking: { target: on(trailTrack, 0.5, 1), from: [-0.45, 0.35, 1], spanH: 13, spanW: 20 },
    tennis: { target: [TENNIS.x, 0.5, TENNIS.z], from: [-0.15, 0.7, 1], spanH: 9, spanW: 22 },
    volleyball: { target: [VOLLEY.x, 0.5, VOLLEY.z], from: [0.15, 0.7, 1], spanH: 8, spanW: 18 },
    exit: whole,
  };
};
