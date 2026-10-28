import {
  CylinderGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Lavori (spec §13), prima versione e prova del motore delle micro-scene: una linea
 * del tempo che sale con lo scroll e una tappa low-poly per esperienza, che si accende quando la
 * linea la raggiunge. Solo forme generiche: ruoli, aziende e date stanno nel testo della sezione.
 */

export interface LavoriData {
  /** Numero di esperienze nel testo della sezione (almeno una tappa). */
  count: number;
  /** Almeno un'esperienza e ancora in corso (il testo la marca come tale). */
  ongoing?: boolean;
}

const HEIGHT = 4;
const STEP_X = 0.7;

export function mount(context: SceneContext): SceneInstance {
  const { count, ongoing = false } = (context.data as LavoriData | undefined) ?? { count: 1 };
  const stops = Math.max(1, Math.min(count, 8));

  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const accent = tint(['--sec-lavori', '--text']);
    const muted = tint(['--surface-hi', '--surface']);

    const root = new Group();
    scene.add(root);

    // Linea del tempo: un cilindro sottile che cresce dal basso (scala verticale = avanzamento).
    const spineGeometry = own(new CylinderGeometry(0.04, 0.04, HEIGHT, 6));
    spineGeometry.translate(0, HEIGHT / 2, 0);
    const spine = new Mesh(spineGeometry, own(new MeshStandardMaterial({ color: accent })));
    spine.position.y = -HEIGHT / 2;
    root.add(spine);

    const stopGeometry = own(new IcosahedronGeometry(0.28, 0));
    const edges = own(new EdgesGeometry(stopGeometry));
    const edgeMaterial = own(new LineBasicMaterial({ color: accent }));
    const markers = Array.from({ length: stops }, (_, i) => {
      const material = own(
        new MeshStandardMaterial({ color: muted, emissive: accent, flatShading: true }),
      );
      const marker = new Mesh(stopGeometry, material);
      marker.add(new LineSegments(edges, edgeMaterial));
      const y = -HEIGHT / 2 + ((i + 1) / (stops + 1)) * HEIGHT;
      // Tappe alternate ai due lati, come una timeline verticale.
      marker.position.set(i % 2 === 0 ? -STEP_X : STEP_X, y, 0);
      root.add(marker);
      return { marker, material, at: (i + 1) / (stops + 1) };
    });

    // Esperienza in corso: un anello attorno all'ultima tappa, la piu alta della salita.
    const ring = new Mesh(
      own(new TorusGeometry(0.46, 0.025, 6, 24)),
      own(new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 })),
    );
    ring.visible = ongoing;
    markers[markers.length - 1]?.marker.add(ring);

    const target = new Vector3(0, 0, 0);
    return {
      update(progress) {
        // Prima la linea (fino all'85%), poi un ultimo giro di assestamento.
        const grow = phase(progress, 0, 0.85);
        spine.scale.y = Math.max(grow, 0.001);
        for (const { marker, material, at } of markers) {
          const local = phase(grow, at - 0.08, at + 0.04);
          marker.scale.setScalar(0.2 + local * 0.8);
          material.emissiveIntensity = local * 0.45;
          marker.rotation.set(local * 0.6, local * Math.PI, 0);
        }
        ring.scale.setScalar(phase(progress, 0.85, 1));
        root.rotation.y = (progress - 0.5) * 0.5;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          (HEIGHT * 0.62) / Math.tan(vertical),
          (STEP_X + 0.6) / Math.tan(horizontal),
        );
        camera.position.set(0, 0.6, distance + 0.5);
        camera.lookAt(target);
      },
    };
  });
}
