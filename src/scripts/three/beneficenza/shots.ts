import type { Shot } from '../framing';
import { CLUB, SITE } from './territory';

/*
 * Inquadrature del territorio di Beneficenza (PORT-93), una per momento. Logica pura, senza three.
 * Lo schermo stretto guarda piu dall'alto: il terreno riempie anche il fondo, sotto la scheda.
 */

const club: Shot['target'] = [CLUB.x, 1.2, CLUB.z];

export const shotsFor = (portrait: boolean): Record<string, Shot> => {
  if (portrait) {
    const whole: Shot = { target: [0, 0, 1], from: [0, 1.5, 1], spanH: 36, spanW: 48 };
    return {
      overview: whole,
      'rotaract-abbiategrasso': { target: club, from: [0.15, 1.3, 1], spanH: 14, spanW: 19 },
      'mdio-website': { target: [SITE.x, 0, -1.5], from: [0, 1.3, 1], spanH: 32, spanW: 60 },
      exit: whole,
    };
  }
  const whole: Shot = { target: [0, 0, -1], from: [0, 0.95, 1], spanH: 40, spanW: 66 };
  return {
    overview: whole,
    'rotaract-abbiategrasso': { target: club, from: [0.3, 0.75, 1], spanH: 16, spanW: 26 },
    'mdio-website': { target: [SITE.x, 1, 0], from: [0, 0.8, 1], spanH: 34, spanW: 84 },
    exit: whole,
  };
};
