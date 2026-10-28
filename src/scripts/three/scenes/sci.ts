import {
  CatmullRomCurve3,
  ConeGeometry,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Sci (spec §13): una montagna low-poly e una linea che scende disegnando curve con
 * l'avanzamento ("la curva perfetta"). La traccia e un tubo di cui si mostra solo la parte
 * percorsa; con progress=1 e tutta la discesa, buon fotogramma statico.
 */

const HEIGHT = 3.2;
const RADIUS = 1.9;
const SEGMENTS = 64;
const SIDES = 4;
/** Indici per segmento del tubo: lati * 2 triangoli * 3 vertici. */
const PER_SEGMENT = SIDES * 6;

/** Punto sul fianco della montagna a quota `t` (0 vetta, 1 base), con la curva `bend`. */
function onSlope(t: number): Vector3 {
  const y = HEIGHT * (1 - t * 0.92) - 0.02;
  const radius = (RADIUS * (1 - y / HEIGHT) + 0.03) * 1.1;
  // Angolo che oscilla attorno al fronte: le curve si allargano scendendo.
  const angle = Math.sin(t * Math.PI * 4.5) * (0.25 + t * 0.55);
  return new Vector3(radius * Math.sin(angle), y - HEIGHT / 2, radius * Math.cos(angle));
}

export function mount(context: SceneContext): SceneInstance {
  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const rock = own(
      new MeshStandardMaterial({
        color: tint(['--border', '--surface-hi']),
        flatShading: true,
      }),
    );
    const snow = own(new MeshStandardMaterial({ color: tint(['--text']), flatShading: true }));
    const trail = own(
      new MeshStandardMaterial({
        color: tint(['--sec-sport', '--text']),
        emissive: tint(['--sec-sport', '--text']),
        emissiveIntensity: 0.35,
      }),
    );

    const base = new Mesh(own(new ConeGeometry(RADIUS, HEIGHT, 7)), rock);
    scene.add(base);
    // Cappello di neve: stesso cono, piccolo, appoggiato in vetta.
    const capHeight = HEIGHT * 0.28;
    const cap = new Mesh(own(new ConeGeometry(RADIUS * 0.28 * 1.04, capHeight, 7)), snow);
    cap.position.y = HEIGHT / 2 - capHeight / 2 + 0.005;
    scene.add(cap);

    const points = Array.from({ length: 24 }, (_, i) => onSlope(i / 23));
    const geometry = own(new TubeGeometry(new CatmullRomCurve3(points), SEGMENTS, 0.035, SIDES));
    const line = new Mesh(geometry, trail);
    scene.add(line);

    // Lo sciatore: una punta che segue la testa della traccia.
    const skier = new Mesh(own(new ConeGeometry(0.09, 0.2, 4)), trail);
    scene.add(skier);
    const curve = new CatmullRomCurve3(points);

    return {
      update(progress) {
        const run = phase(progress, 0.05, 1);
        geometry.setDrawRange(0, Math.round(run * SEGMENTS) * PER_SEGMENT);
        skier.visible = run > 0;
        skier.position.copy(curve.getPointAt(run));
        scene.rotation.y = (progress - 0.5) * 0.35;
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(
          (HEIGHT * 0.62) / Math.tan(vertical),
          (RADIUS * 1.2) / Math.tan(horizontal),
        );
        camera.position.set(0, 0.5, distance + 1);
        camera.lookAt(0, -0.1, 0);
      },
    };
  });
}
