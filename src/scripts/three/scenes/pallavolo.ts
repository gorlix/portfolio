import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import { mountMicro } from '../micro';
import { createPenguin } from '../penguin';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Pallavolo (spec §13): due pinguini low-poly e un bagher ("passato da
 * pallavolista"). La palla cade sul primo, che la alza con le pinne unite, e vola verso il
 * secondo, che si abbassa a riceverla. Il fotogramma finale e il secondo bagher.
 */

const SPACING = 1.0;
/** Altezza del pinguino (~1) e punto di contatto della palla, davanti alle pinne unite. */
const CONTACT_X = SPACING - 0.5;
const CONTACT_Y = 0.55;

const ease = (t: number): number => t * t * (3 - 2 * t);

export function mount(context: SceneContext): SceneInstance {
  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const colors = {
      body: tint(['--border', '--surface-hi']),
      belly: tint(['--text']),
      beak: tint(['--ctp-peach', '--text']),
      eye: tint(['--bg-deep', '--bg']),
    };
    const players = [createPenguin(colors), createPenguin(colors)];
    // Giocatore 0 a sinistra guarda +X, il 1 a destra guarda -X.
    players.forEach((p, i) => {
      own(p);
      p.root.position.x = i === 0 ? -SPACING : SPACING;
      // Di tre quarti verso la camera: si vedono pancia e becco, non solo il fianco.
      p.root.rotation.y = i === 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
      // Fascia al collo: il colore distingue le due squadre.
      const band = new Mesh(
        own(new TorusGeometry(0.16, 0.035, 5, 10)),
        own(
          new MeshStandardMaterial({
            color: tint(i === 0 ? ['--sec-sport', '--text'] : ['--sec-sport-alt', '--sec-sport']),
            flatShading: true,
          }),
        ),
      );
      band.rotation.x = Math.PI / 2 + 0.2;
      band.position.set(0, -0.14, 0.01);
      p.joints.head.add(band);
      scene.add(p.root);
    });

    const ball = new Mesh(
      own(new IcosahedronGeometry(0.22, 1)),
      own(new MeshStandardMaterial({ color: tint(['--text']), flatShading: true })),
    );
    const group = new Group();
    group.add(ball);
    scene.add(group);

    return {
      update(progress) {
        const fall = phase(progress, 0, 0.3);
        const flight = phase(progress, 0.3, 0.85);
        players[0]?.setPose(
          'bagher',
          ease(phase(progress, 0, 0.25)) * (1 - ease(phase(progress, 0.5, 0.8))),
        );
        players[1]?.setPose('bagher', ease(phase(progress, 0.45, 0.85)));
        if (progress < 0.3) {
          ball.position.set(-CONTACT_X, CONTACT_Y + 2 * (1 - fall * fall), 0);
        } else {
          ball.position.set(
            -CONTACT_X + 2 * CONTACT_X * flight,
            CONTACT_Y + 1.6 * Math.sin(flight * Math.PI),
            0,
          );
        }
        ball.rotation.z = progress * 8;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        // Inquadratura stretta sui due pinguini: nei riquadri piccoli restano ben visibili (PORT-85).
        const distance = Math.max(
          0.95 / Math.tan(vertical),
          (SPACING + 0.4) / Math.tan(horizontal),
        );
        camera.position.set(0, 1.0, distance + 0.6);
        camera.lookAt(0, 0.95, 0);
      },
    };
  });
}
