import type { Shot } from '../framing';
import { type Mesher, mesher, type Rgb } from '../interessi/mesher';
import { ease } from '../story';

/*
 * Scrivania dei Contatti (PORT-99): il terminale, cosa mostra lo schermo a ogni punto del racconto
 * e le inquadrature dei tre momenti. Logica pura, senza three: dipende solo dallo scroll.
 */

/** Righe di prompt sullo schermo prima del comando finale. */
export const LINES = 6;
/** Centro e misure dello schermo; sta davanti al corpo e dietro la cornice. */
export const SCREEN = { y: 7.2, z: 4.2, width: 10, height: 7.2 } as const;
/** Il pinguino e seduto sul piano, a sinistra del terminale, girato verso lo schermo. */
export const SEAT = { x: -11.5, z: 3, scale: 3.6, heading: 0.9 } as const;

/** Righe gia comparse: una sulla prima schermata, tutte sulla scheda Scrivimi. */
export const linesAt = (story: number): number =>
  1 + Math.ceil((LINES - 1) * ease((story - 0.1) / 0.8));
/** Quota del comando finale gia battuta, da 0 a 1: finisce prima della scheda di uscita. */
export const logoutAt = (story: number): number => ease((story - 1.1) / 0.5);
/** Quanto si e abbassata la luce, da 0 a 1. */
export const dimAt = (story: number): number => ease((story - 1.4) / 0.5);

/** Inquadrature: `portrait` per gli schermi stretti. */
export function shotsFor(portrait: boolean): Record<string, Shot> {
  const screen = [0, SCREEN.y, SCREEN.z] as const;
  // Schermo stretto: il piano arriva oltre la camera, riempie il fondo sotto la scheda.
  if (portrait) {
    return {
      overview: { target: [-2.5, 5, 2], from: [-0.1, 0.34, 1], spanH: 26, spanW: 29 },
      write: { target: [0, SCREEN.y + 1.4, SCREEN.z], from: [0, 0.03, 1], spanH: 30, spanW: 13.5 },
      logout: { target: [-3.5, 6, 2], from: [-0.1, 0.25, 1], spanH: 14, spanW: 25 },
    };
  }
  return {
    overview: { target: [-2, 6.5, 0], from: [-0.08, 0.28, 1], spanH: 28, spanW: 56 },
    write: { target: screen, from: [-0.06, 0.03, 1], spanH: 15, spanW: 27 },
    logout: { target: [-1, 6, 1], from: [0.1, 0.22, 1], spanH: 20, spanW: 46 },
  };
}

export interface DeskPalette {
  wall: Rgb;
  desk: Rgb;
  pad: Rgb;
  body: Rgb;
  bodyDark: Rgb;
  key: Rgb;
  keyAlt: Rgb;
  mug: Rgb;
  paper: Rgb;
}

/** Tutta la parte ferma della scena: una sola mesh colorata faccia per faccia. */
export function buildDesk(c: DeskPalette): Mesher {
  const m = mesher();
  // Stanza: parete e piano molto piu larghi di ogni inquadratura.
  m.box(0, -60, -24, 260, 140, 2, c.wall);
  m.box(0, -1.2, 50, 240, 1.2, 146, c.desk);
  m.box(0, 0, 9.5, 19, 0.1, 8, c.pad);

  // Terminale: piede, collo, corpo e cornice attorno allo schermo.
  m.box(0, 0, 0, 7, 0.8, 6, c.bodyDark);
  m.box(0, 0.8, 0, 3, 1.4, 3, c.bodyDark);
  m.box(0, 2.2, 0, 13, 10, 8, c.body);
  const [left, right] = [-SCREEN.width / 2, SCREEN.width / 2];
  const [bottom, top] = [SCREEN.y - SCREEN.height / 2, SCREEN.y + SCREEN.height / 2];
  m.box(0, 2.4, 4.25, 12.6, bottom - 2.4, 0.5, c.bodyDark);
  m.box(0, top, 4.25, 12.6, 12 - top, 0.5, c.bodyDark);
  m.box(left - 0.65, bottom, 4.25, 1.3, top - bottom, 0.5, c.bodyDark);
  m.box(right + 0.65, bottom, 4.25, 1.3, top - bottom, 0.5, c.bodyDark);

  // Tastiera: un blocco e i tasti, a file sfalsate.
  m.box(0, 0.1, 9.5, 15, 0.5, 5.4, c.bodyDark);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const tint = (row + col) % 5 === 0 ? c.keyAlt : c.key;
      m.box(-6.6 + col * 1.2 + (row % 2) * 0.2, 0.6, 7.75 + row * 1.15, 1, 0.3, 0.95, tint);
    }
  }

  // Tazza e fogli sul lato libero.
  m.lathe(
    [
      [0.95, 0],
      [1.1, 0.1],
      [1.2, 2.1],
    ],
    8,
    c.mug,
    { x: 13, z: 7 },
  );
  m.box(13.5, 0, 0.5, 5.5, 0.25, 7, c.paper, { ry: 0.2 });
  m.box(13.8, 0.25, 0.3, 5.5, 0.25, 7, c.key, { ry: -0.1 });
  return m;
}
