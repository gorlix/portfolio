import {
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mountMicro } from '../micro';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Beneficenza (spec §13): tono sobrio, movimento minimo. Una rete di punti attorno a
 * un nodo centrale: con lo scroll i punti si avvicinano piano e i collegamenti si chiudono. Solo
 * forme generiche, niente testo: i fatti stanno nella sezione.
 */

export interface BeneficenzaData {
  /** Numero di punti della rete (le voci della sezione, almeno tre per una forma leggibile). */
  count: number;
}

const FAR = 1.7;
const NEAR = 1.2;

/** Avanzamento locale di una fase che occupa [from, to] dell'avanzamento totale. */
const phase = (progress: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (progress - from) / (to - from)));

export function mount(context: SceneContext): SceneInstance {
  const { count } = (context.data as BeneficenzaData | undefined) ?? { count: 3 };
  const points = Math.max(3, Math.min(count, 8));

  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const accent = tint(['--sec-beneficenza', '--text']);
    const muted = tint(['--surface-hi', '--surface']);

    const root = new Group();
    scene.add(root);

    const nodeGeometry = own(new IcosahedronGeometry(0.2, 0));
    const centerMaterial = own(
      new MeshStandardMaterial({ color: muted, emissive: accent, flatShading: true }),
    );
    const center = new Mesh(nodeGeometry, centerMaterial);
    root.add(center);

    // Un collegamento e un cilindro di lunghezza 1 lungo +Y, ruotato verso il punto e scalato.
    const linkGeometry = own(new CylinderGeometry(0.025, 0.025, 1, 6));
    linkGeometry.translate(0, 0.5, 0);
    const linkMaterial = own(new MeshStandardMaterial({ color: accent }));
    const nodeMaterial = own(
      new MeshStandardMaterial({ color: muted, emissive: accent, flatShading: true }),
    );

    const ring = Array.from({ length: points }, (_, i) => {
      const angle = (i / points) * Math.PI * 2 + Math.PI / 2;
      const node = new Mesh(nodeGeometry, nodeMaterial);
      const pivot = new Group();
      pivot.rotation.z = angle - Math.PI / 2;
      const link = new Mesh(linkGeometry, linkMaterial);
      pivot.add(link);
      root.add(node, pivot);
      return { node, link, angle };
    });

    const target = new Vector3(0, 0, 0);
    return {
      update(progress) {
        const approach = phase(progress, 0, 0.7);
        const close = phase(progress, 0.3, 1);
        const radius = FAR + (NEAR - FAR) * approach;
        centerMaterial.emissiveIntensity = 0.1 + close * 0.3;
        nodeMaterial.emissiveIntensity = 0.1 + close * 0.3;
        center.scale.setScalar(0.8 + close * 0.3);
        for (const { node, link, angle } of ring) {
          node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
          link.scale.y = Math.max(radius * close, 0.001);
        }
        root.rotation.y = (progress - 0.5) * 0.3;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          ((FAR + 0.4) * 1.0) / Math.tan(vertical),
          (FAR + 0.4) / Math.tan(horizontal),
        );
        camera.position.set(0, 0.3, distance + 0.5);
        camera.lookAt(target);
      },
    };
  });
}
