import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Vector3Tuple,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { cameraAt, cardFraming, fitDistance, type Shot } from '../framing';
import { revealAt, shotsFor, stationX, stopOf, WALK_Z, walkAt } from '../interessi/bench';
import type { Mesher, Rgb } from '../interessi/mesher';
import {
  buildBench,
  GEAR_PHASE,
  GEAR_RATIO,
  gearAxles,
  lidHinge,
  printHeight,
} from '../interessi/objects';
import { createPenguin, STRIDE } from '../penguin';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Interessi (spec §13), immersiva (PORT-92): un banco da lavoro gigante con sei oggetti in
 * fila, il pinguino piccolo che cammina sul piano. La sua posizione dipende solo dallo scroll: fermo
 * a ogni scheda, accanto all'oggetto. Parti ferme e parete sono una sola mesh colorata per faccia
 * (../interessi/objects.ts); ingranaggi e tasti sono cicli lenti legati al tempo, fermi fuori
 * schermo e con meno movimento. Solo forme generiche, tutto procedurale, colori dai token.
 */

const FOV = 30;
/** Rincorsa del racconto verso lo scroll (1/s) e velocita con cui ci si gira (1/s). */
const STORY_CATCH_UP = 4;
const TURN = 8;
const EPSILON = 0.0005;
/** Sotto questo scarto lo scroll e fermo: il pinguino smette di camminare. */
const STILL_GAP = 0.004;
/** Il pinguino e piccolo davanti agli oggetti, ma deve leggersi anche da lontano. */
const PENGUIN_SCALE = 1.6;
/** Rivolto all'oggetto che ha a destra, di tre quarti verso la camera. */
const FACE = Math.PI / 2 - 0.6;
/** Momento di partenza del tempo: con meno movimento gira tutto da qui, un fotogramma fermo. */
const STILL_TIME = 2;
/** Radianti al secondo del grande ingranaggio, periodo dei tasti e corsa della testina. */
const GEAR_SPEED = 0.25;
const KEY_SPEED = 0.8;
const HEAD_SPEED = 0.6;
const HEAD_REACH = 1.3;
/** Pezzo gia iniziato prima di arrivarci e quanto si apre la cupola, in radianti. */
const PRINT_START = 0.3;
const LID_OPEN = 1.9;

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
  // Near non troppo piccolo: la camera sta sempre oltre 10 unita, piu precisione di profondita.
  const camera = new PerspectiveCamera(FOV, 1, 3, 240);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const accent = tint(['--sec-interessi', '--text']);
  const alt = tint(['--sec-interessi-alt', '--sec-interessi', '--text']);
  const peach = tint(['--ctp-peach', '--text']);
  const red = tint(['--ctp-red', '--text']);
  const soft = (color: Color, amount: number) => surface.clone().lerp(color, amount);
  const channels = (color: Color): Rgb => [color.r, color.g, color.b];
  const key = soft(text, 0.35);

  const bench = buildBench({
    wood: channels(soft(peach, 0.5)),
    woodAlt: channels(soft(peach, 0.42)),
    apron: channels(soft(peach, 0.22)),
    wall: channels(surface),
    wallLow: channels(tint(['--surface-hi', '--surface'])),
    mat: channels(soft(accent, 0.2)),
    frame: channels(tint(['--bg-deep', '--bg'])),
    metal: channels(soft(text, 0.6)),
    paper: channels(soft(text, 0.92)),
    paperAlt: channels(soft(text, 0.8)),
    ink: channels(tint(['--bg-deep', '--bg'])),
    accent: channels(accent),
    alt: channels(alt),
    key: channels(key),
    rust: channels(peach.clone().lerp(red, 0.45)),
    rustAlt: channels(peach.clone().lerp(red, 0.15)),
    rock: channels(tint(['--bg-deep', '--bg']).lerp(tint(['--ctp-mauve', '--text']), 0.14)),
    rockAlt: channels(tint(['--bg-deep', '--bg']).lerp(tint(['--ctp-mauve', '--text']), 0.34)),
    food: channels(tint(['--ctp-yellow', '--text'])),
    herb: channels(tint(['--ctp-green', '--text'])),
    glass: channels(soft(tint(['--ctp-sky', '--text']), 0.7)),
    lid: channels(soft(text, 0.7)),
  });

  const painted = own(
    new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
  );
  const geometryOf = (m: Mesher): BufferGeometry => {
    const geometry = own(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(m.positions(), 3));
    geometry.setAttribute('color', new BufferAttribute(m.colors(), 3));
    return geometry;
  };
  const add = (m: Mesher, material: Material = painted): Mesh => {
    const mesh = new Mesh(geometryOf(m), material);
    // Pezzi animati: con draw range e cerniere il volume di partenza non vale.
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  add(bench.still);
  const print = add(bench.print.mesh).geometry;
  const lines = add(bench.lines.mesh).geometry;
  const gantry = add(bench.gantry);
  const head = add(bench.head);
  const keyPaint = (): MeshStandardMaterial =>
    own(
      new MeshStandardMaterial({ color: key, emissive: accent, flatShading: true, roughness: 0.8 }),
    );
  const keysA = keyPaint();
  const keysB = keyPaint();
  add(bench.keysA, keysA);
  add(bench.keysB, keysB);

  const axles = gearAxles(stationX(4));
  const gearBig = add(bench.gearBig);
  const gearSmall = add(bench.gearSmall);
  gearBig.position.set(...axles.big);
  gearSmall.position.set(...axles.small);
  const hinge = new Group();
  hinge.position.set(...lidHinge(stationX(5)));
  scene.add(hinge);
  const lid = add(bench.lid);
  hinge.add(lid);

  const penguin = own(
    createPenguin({
      body: tint(['--ctp-surface2', '--surface-hi']),
      belly: text,
      beak: peach,
      eye: tint(['--bg-deep', '--bg']),
    }),
  );
  penguin.root.scale.setScalar(PENGUIN_SCALE);
  scene.add(penguin.root);

  const light = text.clone().lerp(tint(['--ctp-rosewater', '--text']), 0.5);
  const sun = new DirectionalLight(light, 2.1);
  sun.position.set(-18, 34, 26);
  scene.add(new AmbientLight(light, 1), sun);

  // --- Stato ------------------------------------------------------------------------------------
  const names = moments.length > 0 ? moments : ['overview'];
  const momentOf = (name: string) => Math.max(0, names.indexOf(name));
  const printing = momentOf('3d-printing');
  const writing = momentOf('supernote');
  const eating = momentOf('food');
  let storyTarget = 0;
  let story = 0;
  let time = STILL_TIME;
  let size = { width: 1, height: 1 };
  let heading = FACE;

  /** Pinguino: fermo alle schede, cammina solo mentre si scorre e nel verso dello scroll. */
  const placePenguin = (dt: number): void => {
    const { x, between } = walkAt(names, story);
    const gap = storyTarget - story;
    const moving = between && Math.abs(gap) > STILL_GAP;
    const arrived = names[Math.round(story)] === 'exit' && x === stopOf('exit');
    const goal = moving ? (gap > 0 ? Math.PI / 2 : -Math.PI / 2) : arrived ? 0 : FACE;
    heading = dt > 0 ? heading + (goal - heading) * Math.min(1, dt * TURN) : goal;
    if (moving) penguin.setPose('run', (x / (STRIDE * PENGUIN_SCALE)) % 1);
    else if (arrived) penguin.setPose('wave', time % 1);
    else penguin.setPose('stand');
    penguin.root.position.set(x, 0, WALK_Z);
    penguin.root.rotation.y = heading;
  };

  const placeObjects = (): void => {
    const done = revealAt(story, printing, PRINT_START);
    print.setDrawRange(0, Math.ceil(done * bench.print.count) * bench.print.step);
    gantry.position.y = printHeight(done);
    head.position.y = printHeight(done);
    head.position.x = Math.sin(time * HEAD_SPEED) * HEAD_REACH;
    lines.setDrawRange(
      0,
      Math.ceil(revealAt(story, writing) * bench.lines.count) * bench.lines.step,
    );
    lid.parent?.rotation.set(0, 0, -LID_OPEN * revealAt(story, eating));
    // A turno: un gruppo di tasti si accende mentre l'altro si spegne.
    const swing = Math.sin(time * KEY_SPEED);
    keysA.emissiveIntensity = 0.75 * Math.max(0, swing);
    keysB.emissiveIntensity = 0.75 * Math.max(0, -swing);
    keysA.color.copy(key).lerp(accent, Math.max(0, swing));
    keysB.color.copy(key).lerp(accent, Math.max(0, -swing));
    gearBig.rotation.z = time * GEAR_SPEED;
    gearSmall.rotation.z = -time * GEAR_SPEED * GEAR_RATIO + GEAR_PHASE;
  };

  const place = (dt: number): void => {
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
    placePenguin(dt);
    placeObjects();
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  // Finche la scena e visibile gira il ciclo d'ambiente; ferma (fuori schermo o meno movimento)
  // nessun fotogramma in coda.
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (dt = 0): void => {
    place(dt);
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    time += dt;
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw(dt);
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
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
