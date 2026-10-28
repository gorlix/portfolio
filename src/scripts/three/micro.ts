import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from './capabilities';
import { firstToken } from './tokens';
import type { SceneContext, SceneInstance } from './types';

/*
 * Base condivisa delle micro-scene (spec §7.3, §13). La scena descrive solo cosa disegnare a un
 * dato avanzamento (0..1); qui stanno renderer, luci, ridimensionamento e la breve rincorsa
 * verso l'avanzamento chiesto dallo scroll. Nessun tempo che scorre da solo: fermando lo scroll
 * la scena si ferma, tornando indietro si riavvolge. A livello 'reduced' un solo fotogramma, la fine.
 */

/** Velocita della rincorsa (1/s): circa 0,3 s per assestarsi, poi nessun fotogramma. */
const CATCH_UP = 9;
const EPSILON = 0.001;

export interface MicroTools {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Registra una risorsa da liberare in dispose (geometrie, materiali). */
  own<T extends { dispose(): void }>(resource: T): T;
  /** Colore del primo token definito (mai valori letterali nel codice 3D). */
  tint(names: readonly `--${string}`[]): Color;
}

export interface MicroScene {
  /** Disegna lo stato all'avanzamento indicato (0 inizio, 1 fine). Deve essere reversibile. */
  update(progress: number): void;
  /** Inquadratura per il rapporto larghezza/altezza indicato. */
  fit(aspect: number): void;
}

export function mountMicro(
  { canvas, container, tier, profile }: SceneContext,
  build: (tools: MicroTools) => MicroScene,
): SceneInstance {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const owned: { dispose(): void }[] = [];
  const tools: MicroTools = {
    scene: new Scene(),
    camera: new PerspectiveCamera(35, 1, 0.1, 80),
    own(resource) {
      owned.push(resource);
      return resource;
    },
    tint: (names) => new Color(firstToken(container, names)),
  };
  const light = tools.tint(['--text']);
  tools.scene.add(new AmbientLight(light, 0.9));
  const sun = new DirectionalLight(light, 1.4);
  sun.position.set(-3, 6, 5);
  tools.scene.add(sun);

  const micro = build(tools);

  // Statica: sempre la fine. Animata: parte dall'inizio e insegue lo scroll.
  let current = tier === 'full' ? 0 : 1;
  let target = current;
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;

  const draw = (): void => {
    micro.update(current);
    renderer.render(tools.scene, tools.camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const gap = target - current;
    current = Math.abs(gap) < EPSILON ? target : current + gap * Math.min(1, dt * CATCH_UP);
    draw();
    // Arrivata: nessun fotogramma in coda finche lo scroll non chiede altro.
    frame = current === target ? 0 : requestAnimationFrame(tick);
    if (!frame) last = 0;
  };
  const kick = (): void => {
    if (running && !frame && !disposed && current !== target) frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  return {
    start() {
      if (disposed || tier !== 'full') return;
      running = true;
      kick();
    },
    stop,
    setProgress(progress) {
      if (tier !== 'full') return;
      target = Math.min(1, Math.max(0, progress));
      kick();
    },
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      tools.camera.aspect = width / height;
      micro.fit(tools.camera.aspect);
      tools.camera.updateProjectionMatrix();
      if (!frame) draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
