import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import {
  type BoardData,
  buildBoard,
  clipBand,
  hexagon,
  hexRing,
  prism,
  viewOf,
} from '../certificazioni/board';
import { fitDistance } from '../framing';
import { createPenguin } from '../penguin';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Certificazioni (spec §13), immersiva (PORT-87): una parete-bacheca con slot esagonali e un
 * pinguino che legge davanti. Le certificazioni in corso sono esagoni in costruzione (contorno
 * intero, riempimento a meta), quelle ottenute esagoni pieni: lo decide il campo `status` dei dati
 * (../certificazioni/board.ts). La camera passa da un esagono all'altro seguendo le schede, poi si
 * allarga sulla fila dei badge piccoli. Solo forme generiche, tutto procedurale, colori dai token.
 */

/** Rincorsa del racconto verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 4;
const EPSILON = 0.0005;
/** Quote dei solidi rispetto alla parete (z = 0): ogni faccia ha la sua, nessuna complanare. */
const SLOT_Z = 0.06;
const PLATE_Z = 0.2;
const CORE_Z = 0.32;
const RING_Z = 0.3;
const FILL_Z = 0.16;
const BUILD_LINE_Z = 0.22;
/** Quota del riempimento di un esagono in costruzione: a meta. */
const FILL_LEVEL = 0;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const certs = data as BoardData | undefined;
  if (!certs?.technical) throw new Error('certificazioni: dati della scena assenti');
  const board = buildBoard(certs);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  // Near non troppo piccolo: la camera sta a 10-30 unita, piu precisione di profondita.
  const camera = new PerspectiveCamera(35, 1, 2, 90);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const accent = tint(['--sec-certificazioni', '--text']);
  const paint = (color: Color, emissive = 0): MeshStandardMaterial =>
    own(
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: emissive,
        flatShading: true,
        roughness: 0.85,
      }),
    );
  const soft = (color: Color, amount: number) => surface.clone().lerp(color, amount);
  const m = {
    floor: paint(soft(tint(['--surface-hi', '--surface']), 0.6)),
    frame: paint(soft(text, 0.2)),
    wall: paint(surface.clone()),
    slot: paint(tint(['--bg-deep', '--bg'])),
    plate: paint(soft(accent, 0.55)),
    full: paint(accent.clone(), 0.12),
    glow: paint(accent.clone(), 0.6),
    page: paint(soft(text, 0.85)),
  };

  const root = new Group();
  scene.add(root);
  const cube = own(new BoxGeometry(1, 1, 1));
  const box = (
    material: Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    parent: Group = root,
  ): Mesh => {
    const mesh = new Mesh(cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  };
  const solid = (triangles: number[]): BufferGeometry => {
    const geometry = own(new BufferGeometry());
    geometry.setAttribute('position', new Float32BufferAttribute(triangles, 3));
    // Senza indici: ogni faccia ha le sue normali, spigoli netti.
    geometry.computeVertexNormals();
    return geometry;
  };

  // --- Parete, cornice e pavimento -------------------------------------------------------------
  const { halfWidth, floor, top } = board;
  const height = top - floor;
  const middle = (top + floor) / 2;
  // La cornice sta dietro la parete e sporge tutto intorno: facce su piani diversi.
  box(m.frame, 0, middle + 0.1, -0.45, halfWidth * 2 + 0.4, height + 0.2, 0.5);
  box(m.wall, 0, middle, -0.2, halfWidth * 2, height, 0.4);
  box(m.floor, 0, floor - 0.3, 1.3, halfWidth * 2 + 5, 0.6, 6);

  // --- Esagoni: uno slot per voce, pieno o in costruzione secondo i dati --------------------------
  const slotShape = solid(prism(hexagon(1.14), -0.02, SLOT_Z));
  const plateShape = solid(prism(hexagon(1), SLOT_Z, PLATE_Z));
  const coreShape = solid(prism(hexagon(0.6), PLATE_Z, CORE_Z));
  const ringShape = solid(hexRing(1, 0.84, SLOT_Z, RING_Z));
  const fillShape = solid(prism(clipBand(hexagon(0.82), -2, FILL_LEVEL), SLOT_Z, FILL_Z));
  // Linea di lavoro in cima al riempimento: e lei a pulsare piano.
  const lineShape = solid(
    prism(clipBand(hexagon(0.82), FILL_LEVEL, FILL_LEVEL + 0.06), SLOT_Z, BUILD_LINE_Z),
  );
  for (const slot of board.slots) {
    const hex = new Group();
    hex.position.set(slot.x, slot.y, 0);
    hex.scale.setScalar(slot.radius);
    root.add(hex);
    hex.add(new Mesh(slotShape, m.slot));
    if (slot.state === 'full') {
      hex.add(new Mesh(plateShape, m.plate), new Mesh(coreShape, m.full));
    } else if (slot.state === 'building') {
      hex.add(
        new Mesh(ringShape, m.full),
        new Mesh(fillShape, m.plate),
        new Mesh(lineShape, m.glow),
      );
    }
  }

  // --- Piccoli cubi collegati: un cluster generico, senza logo -------------------------------------
  for (const { x, y } of board.clusters) {
    const nodes = [
      [-0.62, 0.5],
      [0.62, 0.5],
      [-0.62, -0.5],
      [0.62, -0.5],
    ] as const;
    for (const [dx, dy] of nodes) {
      const link = box(m.plate, x + dx / 2, y + dy / 2, 0.2, Math.hypot(dx, dy), 0.05, 0.05);
      link.rotation.z = Math.atan2(dy, dx);
      box(m.full, x + dx, y + dy, 0.24, 0.34, 0.34, 0.34);
    }
    box(m.glow, x, y, 0.28, 0.46, 0.46, 0.46);
  }

  // --- Pinguino con il libro -----------------------------------------------------------------------
  const penguin = own(
    createPenguin({
      body: tint(['--ctp-surface2', '--surface-hi']),
      belly: text,
      beak: tint(['--ctp-peach', '--text']),
      eye: tint(['--bg-deep', '--bg']),
    }),
  );
  scene.add(penguin.root);
  penguin.root.position.set(board.penguin.x, board.penguin.y, board.penguin.z);
  penguin.root.scale.setScalar(1.5);
  penguin.root.rotation.y = -0.3;
  const { flipperL, flipperR, head, body } = penguin.joints;
  // Pinne avanti a reggere il libro: la posa resta quella ferma, cambiano solo le articolazioni.
  flipperL.rotation.set(-1.2, 0, -0.08);
  flipperR.rotation.set(-1.2, 0, 0.08);

  // Libro aperto a V, dorso verso la camera: copertina fuori, pagine verso il pinguino.
  const book = new Group();
  book.position.set(0, 0, 0.52);
  book.rotation.x = 0.5;
  body.add(book);
  for (const side of [-1, 1]) {
    const half = new Group();
    half.rotation.y = side * 0.3;
    book.add(half);
    box(m.full, side * 0.16, 0, 0, 0.32, 0.42, 0.025, half);
    box(m.page, side * 0.15, 0, -0.03, 0.28, 0.38, 0.04, half);
  }

  const ambient = new AmbientLight(text, 0.9);
  const sun = new DirectionalLight(text, 1.6);
  sun.position.set(-4, 8, 9);
  scene.add(ambient, sun);

  // --- Stato ------------------------------------------------------------------------------------
  let storyTarget = 0;
  let story = 0;
  let clock = 0;
  let size = { width: 1, height: 1 };
  const names = moments.length > 0 ? moments : ['overview'];

  const place = (): void => {
    const { from, to, t } = blendAt(story, names.length);
    const a = viewOf(names[from] ?? 'overview', board, size.width, size.height);
    const b = viewOf(names[to] ?? 'overview', board, size.width, size.height);
    const x = mix(a.x, b.x, t);
    const y = mix(a.y, b.y, t);
    const aspect = size.width / size.height;
    const distance = fitDistance(
      mix(a.spanH, b.spanH, t),
      mix(a.spanW, b.spanW, t),
      aspect,
      camera.fov,
    );
    // Appena di lato e dall'alto: si vede lo spessore degli esagoni.
    camera.position.set(x + distance * 0.08, y + distance * 0.05, distance);
    camera.lookAt(x, y, 0);
    camera.setViewOffset(
      size.width,
      size.height,
      -mix(a.shift, b.shift, t) * size.width * 0.5,
      mix(a.lift, b.lift, t) * size.height,
      size.width,
      size.height,
    );
  };

  /** Il pinguino legge e la linea di lavoro pulsa: movimenti lenti, fermi con reduced-motion. */
  const breathe = (): void => {
    head.rotation.set(0.28 + 0.04 * Math.sin(clock * 0.9), 0.1 * Math.sin(clock * 0.45), 0);
    m.glow.emissiveIntensity = 0.55 + 0.25 * Math.sin(clock * 1.6);
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (): void => {
    breathe();
    place();
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    clock += dt;
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
      if (!running) draw();
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
