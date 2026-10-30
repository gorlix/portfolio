import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type Vector3Tuple,
  WebGLRenderer,
} from 'three';
import { shotsFor } from '../beneficenza/shots';
import {
  BLOCK_RELIEF,
  BLOCKS,
  blockLit,
  CLUB,
  LIGHT_LIST,
  LINK_LIST,
  PANEL,
  type Rgb,
  reveal,
  SITE,
  territoryBuffers,
} from '../beneficenza/territory';
import { pixelRatioFor } from '../capabilities';
import { cameraAt, cardFraming, fitDistance, type Shot } from '../framing';
import { createPenguin } from '../penguin';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Beneficenza (spec §13), immersiva (PORT-93): un territorio low-poly visto dall'alto, tono
 * sobrio. Sulla scheda del Rotaract le luci di un quartiere si collegano piano, con il pinguino
 * fermo accanto; sulla scheda del sito si collegano anche gli altri due quartieri e tre archi
 * raggiungono il pannello. Tutto dipende dallo scroll; l'unico ciclo d'ambiente e il respiro lento
 * delle luci, fermo fuori schermo e con meno movimento. Forme generiche, colori dai token.
 */

const FOV = 30;
/** Rincorsa del racconto verso lo scroll (1/s). */
const STORY_CATCH_UP = 4;
const EPSILON = 0.0005;
/** Respiro di una luce accesa e suo ritmo. */
const BREATH = 0.12;
const BREATH_SPEED = 0.7;

export function mount({
  canvas,
  container,
  tier,
  profile,
  moments = [],
}: SceneContext): SceneInstance {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  // Near non troppo piccolo: la camera sta sempre oltre 15 unita, piu precisione di profondita.
  const camera = new PerspectiveCamera(FOV, 1, 4, 320);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const accent = tint(['--sec-beneficenza', '--text']);
  const channels = (color: Color): Rgb => [color.r, color.g, color.b];
  const soft = (color: Color, amount: number) => surface.clone().lerp(color, amount);

  const { positions, colors } = territoryBuffers({
    meadow: channels(soft(tint(['--ctp-green', '--text']), 0.32)),
    field: channels(soft(tint(['--ctp-teal', '--text']), 0.22)),
    wood: channels(soft(tint(['--ctp-green', '--text']), 0.5)),
    garden: channels(soft(accent, 0.85)),
    wall: channels(soft(text, 0.6)),
    roof: channels(soft(tint(['--ctp-peach', '--text']), 0.5)),
    stone: channels(soft(text, 0.25)),
    panel: channels(tint(['--bg-deep', '--bg'])),
    fade: channels(tint(['--bg', '--bg-alt'])),
  });
  const territory = own(new BufferGeometry());
  territory.setAttribute('position', new BufferAttribute(positions, 3));
  territory.setAttribute('color', new BufferAttribute(colors, 3));
  scene.add(
    new Mesh(
      territory,
      own(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })),
    ),
  );

  // --- Luci e collegamenti: due sole mesh a istanze, colore per istanza ---------------------------
  const unlit = own(new MeshBasicMaterial());
  const lights = new InstancedMesh(own(new IcosahedronGeometry(1, 0)), unlit, LIGHT_LIST.length);
  const wire = own(new CylinderGeometry(1, 1, 1, 5));
  wire.translate(0, 0.5, 0);
  const wires = new InstancedMesh(
    wire,
    own(new MeshBasicMaterial({ color: accent })),
    LINK_LIST.length,
  );
  lights.frustumCulled = false;
  wires.frustumCulled = false;
  scene.add(lights, wires);

  const matrix = new Matrix4();
  const stretch = new Vector3();
  const spin = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const start = new Vector3();
  const end = new Vector3();
  const dark = soft(text, 0.32);
  const lit = accent.clone().lerp(text, 0.25);
  const shade = new Color();

  LIGHT_LIST.forEach(({ position, size }, i) => {
    matrix.makeScale(size, size, size).setPosition(...(position as Vector3Tuple));
    lights.setMatrixAt(i, matrix);
    lights.setColorAt(i, dark);
  });

  // Blocchi generici della pagina: si accendono quando arriva il loro arco.
  const blockPaint = BLOCKS.map(() => own(new MeshBasicMaterial({ color: dark })));
  const panelFront = SITE.z + PANEL.depth / 2;
  BLOCKS.forEach(([dx, dy, w, h], k) => {
    const depth = 0.4;
    const block = new Mesh(own(new BoxGeometry(w, h, depth)), blockPaint[k]);
    block.position.set(SITE.x + dx, PANEL.y + dy, panelFront + BLOCK_RELIEF - depth / 2);
    scene.add(block);
  });

  const penguin = own(
    createPenguin({
      body: tint(['--ctp-surface2', '--surface-hi']),
      belly: text,
      beak: tint(['--ctp-peach', '--text']),
      eye: tint(['--bg-deep', '--bg']),
    }),
  );
  penguin.setPose('stand');
  penguin.root.position.set(CLUB.x + 1.9, 0, CLUB.z + 3);
  penguin.root.rotation.y = 0.3;
  penguin.root.scale.setScalar(1.25);
  scene.add(penguin.root);

  scene.add(new AmbientLight(text, 1.1));
  const sun = new DirectionalLight(text, 1.8);
  sun.position.set(-30, 45, 30);
  scene.add(sun);

  // --- Stato ------------------------------------------------------------------------------------
  const names = moments.length > 0 ? moments : ['overview'];
  let storyTarget = 0;
  let story = 0;
  let drawnStory = -1;
  let time = 0;
  let size = { width: 1, height: 1 };

  /** Collegamenti e blocchi: solo quando il racconto si muove. */
  const placeNetwork = (): void => {
    LINK_LIST.forEach(({ a, b, radius, from, to }, i) => {
      const grown = reveal(story, from, to);
      start.set(...(a as Vector3Tuple));
      end.set(...(b as Vector3Tuple));
      const length = end.distanceTo(start);
      spin.setFromUnitVectors(up, end.clone().sub(start).normalize());
      // Un filo non ancora partito non deve lasciare nemmeno un punto.
      if (grown > 0) stretch.set(radius, length * grown, radius);
      else stretch.setScalar(0);
      matrix.compose(start, spin, stretch);
      wires.setMatrixAt(i, matrix);
    });
    wires.instanceMatrix.needsUpdate = true;
    blockPaint.forEach((paint, k) => {
      paint.color.copy(dark).lerp(lit, blockLit(story, k));
    });
  };

  /** Luci: accese dal racconto, con il respiro lento quando il ciclo gira. */
  const paintLights = (): void => {
    LIGHT_LIST.forEach(({ from, to }, i) => {
      const on = reveal(story, from, to);
      const breath = 1 + Math.sin(time * BREATH_SPEED + i * 1.7) * BREATH * on;
      shade.copy(dark).lerp(lit, on);
      lights.setColorAt(i, shade.multiplyScalar(breath));
    });
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
  };

  const frameCamera = (): void => {
    const table = shotsFor(size.width < size.height);
    const shots = names.map((name) => table[name] ?? (table.overview as Shot));
    const aspect = size.width / size.height;
    const distances = shots.map((s) => fitDistance(s.spanH, s.spanW, aspect, FOV));
    const { eye, target, from, to, t } = cameraAt(shots, distances, story);
    camera.position.set(...(eye as Vector3Tuple));
    camera.lookAt(...(target as Vector3Tuple));
    // Inquadrature larghe senza spostamento; sulle schede il soggetto si scosta dalla scheda.
    const framing = cardFraming(size.width);
    const offset = (index: number) => {
      const name = names[index];
      return name === 'overview' || name === 'exit' ? { shift: 0, lift: 0 } : framing;
    };
    const a = offset(from);
    const b = offset(to);
    camera.setViewOffset(
      size.width,
      size.height,
      -(a.shift + (b.shift - a.shift) * t) * size.width * 0.5,
      (a.lift + (b.lift - a.lift) * t) * size.height,
      size.width,
      size.height,
    );
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  // Finche la scena e visibile gira il respiro delle luci; ferma (fuori schermo o meno movimento)
  // nessun fotogramma in coda.
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (): void => {
    if (story !== drawnStory) {
      placeNetwork();
      drawnStory = story;
    }
    paintLights();
    frameCamera();
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    time += dt;
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw();
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  return {
    start() {
      if (disposed || tier !== 'full' || running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    },
    stop,
    setStory(position) {
      storyTarget = Math.max(0, position);
      // Statica (o fuori schermo): si salta al momento e si ridisegna una volta.
      if (!running) {
        story = storyTarget;
        if (!disposed) draw();
      }
    },
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      size = { width: w, height: h };
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!frame) draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      lights.dispose();
      wires.dispose();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
