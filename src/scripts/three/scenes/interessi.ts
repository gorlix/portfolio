import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { mountMicro } from '../micro';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Interessi (spec §13): un oggetto low-poly simbolico per ogni argomento della
 * sezione, nell'ordine del testo. Ognuno compare (sale e cresce) quando l'avanzamento lo
 * raggiunge; la stampante deposita i suoi strati uno alla volta. Forme generiche, nessun dato.
 */

export interface InteressiData {
  /** Identificativi degli argomenti, nell'ordine del testo (almeno uno). */
  items: string[];
}

const GAP = 1.7;
const COLUMNS = 3;
const LAYERS = 6;

const phase = (progress: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (progress - from) / (to - from)));

export function mount(context: SceneContext): SceneInstance {
  const { items } = (context.data as InteressiData | undefined) ?? { items: [] };
  const slugs = items.length > 0 ? items.slice(0, 9) : ['altro'];
  const columns = Math.min(COLUMNS, slugs.length);
  const rows = Math.ceil(slugs.length / COLUMNS);

  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const accent = tint(['--sec-interessi', '--text']);
    const alt = tint(['--sec-interessi-alt', '--sec-interessi', '--text']);
    const base = tint(['--surface-hi', '--surface']);
    const main = (color = accent): MeshStandardMaterial =>
      own(new MeshStandardMaterial({ color, flatShading: true }));
    const box = (w: number, h: number, d: number, material: Material, y = 0, x = 0): Mesh => {
      const mesh = new Mesh(own(new BoxGeometry(w, h, d)), material);
      mesh.position.set(x, y, 0);
      return mesh;
    };

    const mAccent = main();
    const mAlt = main(alt);
    const mBase = main(base);

    /** Un oggetto per argomento; `layers` serve alla stampante (strati che si depositano). */
    const build = (slug: string): { group: Group; layers: Mesh[] } => {
      const group = new Group();
      const layers: Mesh[] = [];
      switch (slug) {
        case '3d-printing': {
          group.add(box(1.0, 0.08, 1.0, mBase, -0.5));
          group.add(box(0.08, 1.0, 0.08, mBase, 0, -0.5));
          group.add(box(1.0, 0.08, 0.08, mBase, 0.5));
          for (let i = 0; i < LAYERS; i++) {
            const layer = box(0.5, 0.08, 0.5, i % 2 ? mAlt : mAccent, -0.42 + i * 0.08, 0.1);
            layers.push(layer);
            group.add(layer);
          }
          break;
        }
        case 'zsa-moonlander': {
          // Tastiera split: due metà inclinate con un piccolo rialzo per i pollici.
          for (const side of [-1, 1]) {
            const half = box(0.55, 0.12, 0.8, mBase, -0.3, side * 0.38);
            half.rotation.z = -side * 0.12;
            half.add(box(0.4, 0.06, 0.6, side < 0 ? mAccent : mAlt, 0.09));
            group.add(half);
          }
          break;
        }
        case 'supernote': {
          // Tablet e-ink con una penna appoggiata.
          group.add(box(0.8, 1.0, 0.07, mBase));
          group.add(box(0.64, 0.84, 0.08, mAlt));
          const pen = new Mesh(own(new CylinderGeometry(0.025, 0.025, 0.9, 6)), mAccent);
          pen.rotation.z = 0.2;
          pen.position.set(0.55, -0.05, 0.05);
          group.add(pen);
          break;
        }
        case 'obsidian': {
          // Gemma: dodecaedro, come il logo ma senza copiarlo.
          group.add(new Mesh(own(new DodecahedronGeometry(0.45, 0)), mAccent));
          break;
        }
        case 'rust': {
          // Ingranaggio: anello con tre denti.
          const ring = new Mesh(own(new TorusGeometry(0.4, 0.14, 5, 8)), mAccent);
          group.add(ring);
          for (let i = 0; i < 3; i++) {
            const tooth = box(0.16, 0.9, 0.2, mAccent);
            tooth.rotation.z = (i * Math.PI) / 3;
            ring.add(tooth);
          }
          break;
        }
        case 'food': {
          // Piatto con una cupola sopra.
          group.add(new Mesh(own(new CylinderGeometry(0.6, 0.55, 0.08, 8)), mBase)).position.y =
            -0.3;
          const dome = new Mesh(own(new DodecahedronGeometry(0.4, 0)), mAlt);
          dome.scale.y = 0.7;
          dome.position.y = -0.05;
          group.add(dome);
          break;
        }
        default:
          group.add(box(0.7, 0.7, 0.7, mAccent));
      }
      return { group, layers };
    };

    const total = slugs.length;
    const objects = slugs.map((slug, i) => {
      const { group, layers } = build(slug);
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      group.position.set((col - (columns - 1) / 2) * GAP, ((rows - 1) / 2 - row) * GAP, 0);
      scene.add(group);
      return { group, layers, from: (i / total) * 0.85, to: ((i + 1) / total) * 0.85 + 0.15 };
    });

    const target = new Vector3(0, 0, 0);
    return {
      update(progress) {
        for (const [i, { group, layers, from, to }] of objects.entries()) {
          const local = phase(progress, from, to);
          group.visible = local > 0;
          group.scale.setScalar(0.3 + 0.7 * local);
          group.position.z = (1 - local) * -0.8;
          group.rotation.y = -0.5 + local * 0.5 + (progress - 0.5) * 0.3 + i * 0.1;
          // Strati: ognuno si deposita in una frazione della fase dell'oggetto.
          for (const [n, layer] of layers.entries()) {
            layer.visible = local >= (n + 1) / (layers.length + 1);
          }
        }
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          ((rows * GAP) / 2 + 0.3) / Math.tan(vertical),
          ((columns * GAP) / 2 + 0.3) / Math.tan(horizontal),
        );
        camera.position.set(0, 0.5, distance + 0.8);
        camera.lookAt(target);
      },
    };
  });
}
