import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { accentToken, firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena segnaposto (PORT-46): un cubo low-poly a facce piatte che ruota piano.
 * Serve solo a collaudare l'infrastruttura di caricamento pigro; le scene vere arriveranno dopo.
 * Questo modulo e raggiunto solo via `import()` dal registro: three non entra mai nel bootstrap.
 */

/** Radianti al secondo: rotazione lenta, nessun movimento brusco. */
const SPIN_SPEED = 0.35;

export function mount({ canvas, container, tier }: SceneContext): SceneInstance {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: tier === 'full',
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'full' ? 2 : 1));
  // Sfondo trasparente: sotto si vede lo sfondo della sezione, gia definito dal tema.
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(2.6, 2, 3.4);
  camera.lookAt(0, 0, 0);

  const geometry = new BoxGeometry(1.4, 1.4, 1.4);
  const material = new MeshStandardMaterial({
    color: new Color(accentToken(container)),
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
  });
  const cube = new Mesh(geometry, material);

  const edgesGeometry = new EdgesGeometry(geometry);
  const edgesMaterial = new LineBasicMaterial({
    color: new Color(firstToken(container, ['--bg-deep', '--bg'])),
  });
  cube.add(new LineSegments(edgesGeometry, edgesMaterial));
  cube.rotation.set(0.35, 0.6, 0);
  scene.add(cube);

  const light = firstToken(container, ['--text']);
  scene.add(new AmbientLight(new Color(light), 0.9));
  const sun = new DirectionalLight(new Color(light), 1.6);
  sun.position.set(3, 4, 2);
  scene.add(sun);

  let frame = 0;
  let last = 0;
  let disposed = false;

  const draw = (): void => {
    renderer.render(scene, camera);
  };

  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    cube.rotation.y += SPIN_SPEED * dt;
    cube.rotation.x += SPIN_SPEED * 0.4 * dt;
    draw();
    frame = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  return {
    start() {
      if (disposed || frame || tier !== 'full') return;
      frame = requestAnimationFrame(tick);
    },
    stop,
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Ferma (livello ridotto o fuori schermo): un fotogramma aggiornato e basta.
      if (!frame) draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      geometry.dispose();
      material.dispose();
      edgesGeometry.dispose();
      edgesMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
