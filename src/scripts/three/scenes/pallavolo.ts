import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';
import { createFigure } from '../figure';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Pallavolo (spec §13): due personaggi low-poly e un bagher ("passato da
 * pallavolista"). La palla cade sul primo, che la alza con le braccia unite, e vola verso il
 * secondo, che si abbassa a riceverla. Il fotogramma finale e il secondo bagher.
 */

const SPACING = 1.5;
const HEIGHT = 1.9;
/** Punto di contatto della palla, davanti alle braccia unite di chi riceve. */
const CONTACT_X = SPACING - 0.85;
const CONTACT_Y = 0.85;

const ease = (t: number): number => t * t * (3 - 2 * t);

export function mount(context: SceneContext): SceneInstance {
  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const players = [
      createFigure({
        skin: tint(['--ctp-peach', '--text']),
        shirt: tint(['--sec-sport', '--text']),
        trousers: tint(['--surface-hi', '--surface']),
        accent: tint(['--text']),
      }),
      createFigure({
        skin: tint(['--ctp-peach', '--text']),
        shirt: tint(['--sec-sport-alt', '--sec-sport']),
        trousers: tint(['--surface-hi', '--surface']),
        accent: tint(['--sec-sport', '--text']),
      }),
    ];
    // Giocatore 0 a sinistra guarda +X, il 1 a destra guarda -X.
    players.forEach((p, i) => {
      own(p);
      p.root.position.x = i === 0 ? -SPACING : SPACING;
      p.root.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(p.root);
    });

    const ball = new Mesh(
      own(new IcosahedronGeometry(0.22, 1)),
      own(new MeshStandardMaterial({ color: tint(['--text']), flatShading: true })),
    );
    const group = new Group();
    group.add(ball);
    scene.add(group);

    /** Posa da bagher con `amount` 0..1: braccia unite in avanti, ginocchia e busto piegati. */
    const bagher = (index: number, amount: number): void => {
      const player = players[index];
      if (!player) return;
      const { armR, armL, elbowR, elbowL, torso, legR, legL, neck } = player.joints;
      armR.rotation.set(-1.15 * amount, 0, 0.12 * (1 - amount));
      armL.rotation.set(-1.15 * amount, 0, -0.12 * (1 - amount));
      elbowR.rotation.x = 0;
      elbowL.rotation.x = 0;
      torso.rotation.x = 0.35 * amount;
      neck.rotation.x = -0.2 * amount;
      legR.rotation.x = -0.5 * amount;
      legL.rotation.x = 0.35 * amount;
      player.root.position.y = -0.18 * amount;
    };

    return {
      update(progress) {
        const fall = phase(progress, 0, 0.3);
        const flight = phase(progress, 0.3, 0.85);
        bagher(0, ease(phase(progress, 0, 0.25)) * (1 - ease(phase(progress, 0.5, 0.8))));
        bagher(1, ease(phase(progress, 0.45, 0.85)));
        if (progress < 0.3) {
          ball.position.set(-CONTACT_X, CONTACT_Y + 3 * (1 - fall * fall), 0);
        } else {
          ball.position.set(
            -CONTACT_X + 2 * CONTACT_X * flight,
            CONTACT_Y + 2.4 * Math.sin(flight * Math.PI),
            0,
          );
        }
        ball.rotation.z = progress * 8;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(2.1 / Math.tan(vertical), (SPACING + 0.9) / Math.tan(horizontal));
        camera.position.set(0, HEIGHT * 0.7, distance + 0.6);
        camera.lookAt(0, HEIGHT * 0.62, 0);
      },
    };
  });
}
