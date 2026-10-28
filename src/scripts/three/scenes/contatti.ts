import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Contatti (spec §13), chiusura tranquilla: un piccolo terminale low-poly. Con lo
 * scroll lo schermo si accende, le righe di prompt compaiono una dopo l'altra e alla fine
 * appare il cursore, fermo (niente lampeggio: il tempo non scorre da solo). Link e contatti
 * veri stanno nel testo della sezione.
 */

export interface ContattiData {
  /** Numero di canali di contatto nella sezione (una riga di prompt ciascuno, da 2 a 5). */
  count: number;
}

const WIDTH = 3;
const HEIGHT = 2.2;
const LINE_X = -1.05;

export function mount(context: SceneContext): SceneInstance {
  const { count } = (context.data as ContattiData | undefined) ?? { count: 3 };
  const lines = Math.max(2, Math.min(count, 5));

  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const accent = tint(['--sec-contatti', '--text']);
    const body = tint(['--surface-hi', '--surface']);
    const screenColor = tint(['--surface', '--surface-hi']);

    const root = new Group();
    scene.add(root);

    const bodyMaterial = own(new MeshStandardMaterial({ color: body, flatShading: true }));
    const frame = new Mesh(own(new BoxGeometry(WIDTH, HEIGHT, 0.3)), bodyMaterial);
    root.add(frame);

    const stand = new Mesh(own(new BoxGeometry(0.6, 0.25, 0.25)), bodyMaterial);
    stand.position.set(0, -HEIGHT / 2 - 0.12, 0);
    const foot = new Mesh(own(new BoxGeometry(1.4, 0.08, 0.5)), bodyMaterial);
    foot.position.set(0, -HEIGHT / 2 - 0.28, 0);
    root.add(stand, foot);

    const screenMaterial = own(
      new MeshStandardMaterial({ color: screenColor, emissive: accent, flatShading: true }),
    );
    const screen = new Mesh(own(new BoxGeometry(WIDTH - 0.3, HEIGHT - 0.3, 0.05)), screenMaterial);
    screen.position.z = 0.16;
    root.add(screen);

    // Righe di prompt: barre sottili ancorate a sinistra (la scala x parte dal bordo sinistro).
    const barGeometry = own(new BoxGeometry(1, 0.12, 0.04));
    barGeometry.translate(0.5, 0, 0);
    const barMaterial = own(new MeshStandardMaterial({ color: accent }));
    const top = HEIGHT / 2 - 0.5;
    const gap = (HEIGHT - 1.1) / lines;
    const bars = Array.from({ length: lines }, (_, i) => {
      const bar = new Mesh(barGeometry, barMaterial);
      const width = 1.2 + ((i * 37) % 5) * 0.2;
      bar.position.set(LINE_X, top - i * gap, 0.21);
      root.add(bar);
      return { bar, width };
    });

    // Cursore: blocco pieno dopo l'ultima riga, visibile solo a fine corsa.
    const cursor = new Mesh(own(new BoxGeometry(0.16, 0.22, 0.04)), barMaterial);
    cursor.position.set(LINE_X + 0.08, top - lines * gap, 0.21);
    root.add(cursor);

    const target = new Vector3(0, -0.15, 0);
    return {
      update(progress) {
        screenMaterial.emissiveIntensity = phase(progress, 0, 0.25) * 0.1;
        bars.forEach(({ bar, width }, i) => {
          const from = 0.25 + (i / lines) * 0.55;
          const local = phase(progress, from, from + 0.55 / lines);
          bar.scale.x = Math.max(local * width, 0.001);
        });
        cursor.scale.setScalar(Math.max(phase(progress, 0.85, 1), 0.001));
        root.rotation.y = (progress - 0.5) * 0.3;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          (HEIGHT * 0.7) / Math.tan(vertical),
          (WIDTH / 2 + 0.5) / Math.tan(horizontal),
        );
        camera.position.set(0, 0.2, distance + 0.5);
        camera.lookAt(target);
      },
    };
  });
}
