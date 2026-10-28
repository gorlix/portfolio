import { Group, Vector3 } from 'three';
import { createFigure } from '../figure';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Avatar (spec §13): il personaggio low-poly della prima schermata. A riposo guarda
 * di tre quarti e a mano a mano che si scorre si gira verso chi guarda e saluta. Il fotogramma
 * finale (progress=1) e un saluto fermo, quindi vale anche per reduced-motion.
 */

const HEIGHT = 1.9;

const ease = (t: number): number => t * t * (3 - 2 * t);

export function mount(context: SceneContext): SceneInstance {
  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const figure = createFigure({
      skin: tint(['--ctp-peach', '--sec-home']),
      shirt: tint(['--sec-home', '--text']),
      trousers: tint(['--surface-hi', '--surface']),
      accent: tint(['--ctp-lavender', '--text']),
    });
    own(figure);

    const root = new Group();
    root.add(figure.root);
    scene.add(root);
    const { armR, armL, elbowR, elbowL, neck, legR, legL, torso } = figure.joints;

    const target = new Vector3(0, HEIGHT / 2, 0);
    return {
      update(progress) {
        const turn = ease(phase(progress, 0, 0.6));
        const wave = ease(phase(progress, 0.4, 0.75));
        // Il saluto ondeggia in funzione dell'avanzamento (deterministico e reversibile).
        const swing = Math.sin(progress * Math.PI * 6) * 0.35 * wave;

        root.rotation.y = -0.9 * (1 - turn);
        torso.rotation.y = 0.1 * (1 - turn);
        neck.rotation.y = 0.25 * (1 - turn);
        armR.rotation.z = 0.12 + wave * 2.5;
        elbowR.rotation.z = wave * 0.4 + swing;
        armL.rotation.z = -0.12;
        elbowL.rotation.x = -0.1;
        elbowR.rotation.x = 0;
        legR.rotation.x = 0;
        legL.rotation.x = 0;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max((HEIGHT * 0.58) / Math.tan(vertical), 0.9 / Math.tan(horizontal));
        camera.position.set(0, HEIGHT * 0.55, distance + 0.5);
        camera.lookAt(target);
      },
    };
  });
}
