import {
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mountMicro } from '../micro';
import { staggered } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Certificazioni (spec §13): badge esagonali low-poly che si materializzano uno alla
 * volta con lo scroll (le tecniche, grandi) e, in coda, la fila dei piccoli (le accessorie).
 * Solo forme generiche: nomi, enti, date e link di verifica stanno nel testo della sezione.
 */

export interface CertificazioniData {
  /** Certificazioni tecniche nel testo della sezione (almeno un badge). */
  technical: number;
  /** Certificazioni accessorie nel testo (0 = nessuna fila). */
  supplementary: number;
}

const MAX_TECHNICAL = 5;
const MAX_SUPPLEMENTARY = 8;
const BIG = 0.5;
const SMALL = 0.2;
const GAP = 0.25;
/** Quota dell'avanzamento per i badge grandi; il resto serve alla fila delle accessorie. */
const TECHNICAL_SPAN = 0.7;

export function mount(context: SceneContext): SceneInstance {
  const data = (context.data as CertificazioniData | undefined) ?? {
    technical: 1,
    supplementary: 0,
  };
  const technical = Math.max(1, Math.min(data.technical, MAX_TECHNICAL));
  const supplementary = Math.max(0, Math.min(data.supplementary, MAX_SUPPLEMENTARY));

  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const accent = tint(['--sec-certificazioni', '--text']);
    const muted = tint(['--surface-hi', '--surface']);

    const root = new Group();
    scene.add(root);

    // Medaglia: disco esagonale piatto con un anello in rilievo e il bordo tratteggiato.
    const disc = own(new CylinderGeometry(1, 1, 0.22, 6).rotateX(Math.PI / 2));
    const core = own(new CylinderGeometry(0.58, 0.58, 0.32, 6).rotateX(Math.PI / 2));
    const edges = own(new EdgesGeometry(disc));
    const edgeMaterial = own(new LineBasicMaterial({ color: accent }));
    const coreMaterial = own(new MeshStandardMaterial({ color: accent, flatShading: true }));

    const badges: {
      badge: Group;
      material: MeshStandardMaterial;
      index: number;
      small: boolean;
    }[] = [];
    const make = (size: number, x: number, y: number, index: number, small: boolean): void => {
      const material = own(
        new MeshStandardMaterial({ color: muted, emissive: accent, flatShading: true }),
      );
      const badge = new Group();
      const base = new Mesh(disc, material);
      base.add(new LineSegments(edges, edgeMaterial));
      badge.add(base, new Mesh(core, coreMaterial));
      badge.scale.setScalar(0.001);
      badge.position.set(x, y, 0);
      badge.userData.size = size;
      root.add(badge);
      badges.push({ badge, material, index, small });
    };

    const rowWidth = (n: number, size: number): number => n * 2 * size + (n - 1) * GAP;
    const bigY = supplementary > 0 ? 0.55 : 0;
    for (let i = 0; i < technical; i++) {
      const x = -rowWidth(technical, BIG) / 2 + BIG + i * (2 * BIG + GAP);
      make(BIG, x, bigY, i, false);
    }
    const smallY = bigY - BIG - 0.7;
    for (let i = 0; i < supplementary; i++) {
      const x = -rowWidth(supplementary, SMALL) / 2 + SMALL + i * (2 * SMALL + GAP);
      make(SMALL, x, smallY, i, true);
    }

    const halfWidth = Math.max(rowWidth(technical, BIG), rowWidth(supplementary, SMALL)) / 2;
    const halfHeight = supplementary > 0 ? 1.35 : BIG + 0.2;
    const target = new Vector3(0, supplementary > 0 ? (bigY + smallY) / 2 : 0, 0);

    return {
      update(progress) {
        const bigProgress = Math.min(1, progress / TECHNICAL_SPAN);
        const smallProgress = Math.max(0, (progress - TECHNICAL_SPAN) / (1 - TECHNICAL_SPAN));
        for (const { badge, material, index, small } of badges) {
          const local = small
            ? staggered(smallProgress, index, supplementary)
            : staggered(bigProgress, index, technical);
          const size = badge.userData.size as number;
          // Si materializza: cresce, gira su se stesso e si accende; alla fine e fermo e frontale.
          badge.scale.setScalar(Math.max(local, 0.001) * size);
          badge.rotation.set(0, (1 - local) * Math.PI, 0);
          badge.visible = local > 0;
          material.emissiveIntensity = (1 - local) * 0.9 + 0.1;
        }
        root.rotation.y = (progress - 0.5) * 0.18;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          (halfHeight * 1.15) / Math.tan(vertical),
          ((halfWidth + 0.4) * 1.05) / Math.tan(horizontal),
        );
        camera.position.set(0, target.y, distance + 0.5);
        camera.lookAt(target);
      },
    };
  });
}
