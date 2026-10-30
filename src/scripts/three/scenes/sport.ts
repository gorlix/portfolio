import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Vector3Tuple,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { cardFraming, fitDistance } from '../framing';
import { createPenguin, type Penguin } from '../penguin';
import {
  cameraAt,
  climbAt,
  descentAt,
  rallyAt,
  ribbon,
  type Shot,
  STILL_TIME,
  TENNIS_SHOT,
  tennisBallY,
  track,
  trackAt,
  VOLLEY_SHOT,
  volleyBallY,
} from '../sport/course';
import { heightAt, PISTE, type Rgb, TENNIS, TRAIL, terrainBuffers, VOLLEY } from '../sport/terrain';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Sport (spec §13), immersiva (PORT-88): una grande montagna ispirata al Monte Bianco, tre
 * versanti. Al centro la pista con lo sciatore, a sinistra il sentiero con i due escursionisti, a
 * destra il campo da tennis e quello da pallavolo. Terreno, alberi, campi e rifugi sono una sola
 * mesh colorata per faccia (../sport/terrain.ts). Sciatore e palle sono cicli lenti legati al
 * tempo, fermi fuori schermo e con meno movimento; gli escursionisti dipendono solo dallo scroll.
 */

const FOV = 30;
/** Rincorsa del racconto verso lo scroll (1/s) e velocita con cui ci si gira (1/s). */
const STORY_CATCH_UP = 4;
const TURN = 8;
const EPSILON = 0.0005;
/** Sentiero percorso per ogni ciclo del passo, distanza tra i due escursionisti (0..1). */
const STRIDES = 26;
const HIKER_GAP = 0.05;
/** Quanto le strisce si alzano sul terreno: offset vero, mai facce complanari. */
const TRACE_LIFT = 0.07;
/** Altezza del contatto con la palla: pinne del bagher, racchetta. */
const VOLLEY_CONTACT = 0.55;
const VOLLEY_PEAK = 3;
const TENNIS_CONTACT = 0.75;
/** I giocatori si fronteggiano lungo il campo, di tre quarti verso la camera. */
const FACE = Math.PI / 2 - 0.45;

const skiTrack = track(PISTE);
const trailTrack = track(TRAIL);

/** Inquadrature: `portrait` per gli schermi stretti. */
const shotsFor = (portrait: boolean): Record<string, Shot> => {
  const mid = (t: number, height: number): Shot['target'] => {
    const p = trackAt(trailTrack, t);
    return [p.x, heightAt(p.x, p.z) + height, p.z];
  };
  const whole: Shot = {
    target: [0, 7, -2],
    from: [0, 0.22, 1],
    spanH: 24,
    spanW: portrait ? 42 : 66,
  };
  return {
    overview: whole,
    ski: {
      target: [0, heightAt(0, 7) + 1, 7],
      from: [0.2, 0.4, 1],
      spanH: 15,
      spanW: portrait ? 11 : 22,
    },
    hiking: {
      target: mid(0.5, 1),
      from: [-0.45, 0.35, 1],
      spanH: 13,
      spanW: portrait ? 10 : 20,
    },
    tennis: {
      target: [TENNIS.x, 0.5, TENNIS.z],
      from: [-0.15, 0.7, 1],
      spanH: 9,
      spanW: portrait ? 13 : 18,
    },
    volleyball: {
      target: [VOLLEY.x, 0.5, VOLLEY.z],
      from: [0.15, 0.7, 1],
      spanH: 8,
      spanW: portrait ? 11 : 16,
    },
    exit: whole,
  };
};

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
  const camera = new PerspectiveCamera(FOV, 1, 2, 220);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const paint = (color: Color, emissive = 0): Material =>
    own(
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: emissive,
        flatShading: true,
        roughness: 0.9,
      }),
    );
  const rgb = (color: Color): Rgb => [color.r, color.g, color.b];
  const soft = (color: Color, amount: number) => surface.clone().lerp(color, amount);
  const clay = tint(['--ctp-peach', '--text']).lerp(tint(['--ctp-red', '--text']), 0.45);

  const { positions, colors } = terrainBuffers({
    snow: channels(text),
    ice: channels(tint(['--ctp-sky', '--text']).lerp(text, 0.55)),
    rock: channels(soft(tint(['--ctp-overlay1', '--ctp-subtext0', '--text']), 0.7)),
    meadow: channels(soft(tint(['--ctp-green', '--text']), 0.55)),
    forest: channels(soft(tint(['--ctp-teal', '--text']), 0.4)),
    soil: channels(soft(tint(['--ctp-rosewater', '--text']), 0.5)),
    clay: channels(clay),
    court: channels(tint(['--sec-sport', '--ctp-blue', '--text'])),
    line: channels(text),
    wood: channels(soft(tint(['--ctp-peach', '--text']), 0.45)),
    roof: channels(tint(['--ctp-red', '--text'])),
  });
  const terrain = own(new BufferGeometry());
  terrain.setAttribute('position', new BufferAttribute(positions, 3));
  terrain.setAttribute('color', new BufferAttribute(colors, 3));
  scene.add(
    new Mesh(
      terrain,
      own(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })),
    ),
  );

  /** Striscia sul terreno, nel colore dato. */
  const strip = (geometry: BufferGeometry, material: Material): Mesh => {
    const mesh = new Mesh(own(geometry), material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const flat = (points: readonly { x: number; z: number }[], width: number): BufferGeometry =>
    new BufferGeometry().setAttribute(
      'position',
      new BufferAttribute(ribbon(points, width, TRACE_LIFT, heightAt), 3),
    );
  strip(flat(TRAIL, 0.55), paint(soft(tint(['--ctp-rosewater', '--text']), 0.75)));
  const trace = strip(flat(PISTE, 0.16), paint(tint(['--sec-sport', '--text']), 0.35)).geometry;
  const traceFaces = (PISTE.length - 1) * 6;

  // --- Personaggi ---------------------------------------------------------------------------------
  const penguinColors = {
    body: tint(['--ctp-surface2', '--surface-hi']),
    belly: text,
    beak: tint(['--ctp-peach', '--text']),
    eye: tint(['--bg-deep', '--bg']),
  };
  const penguin = (): Penguin => {
    const p = own(createPenguin(penguinColors));
    scene.add(p.root);
    return p;
  };
  const skier = penguin();
  const hikers = [penguin(), penguin()];
  const tennis = [penguin(), penguin()];
  const volley = [penguin(), penguin()];

  // Zaino degli escursionisti, sulla schiena; racchetta alla pinna dei tennisti.
  const pebble = own(new IcosahedronGeometry(0.5, 1));
  const bagPaint = paint(tint(['--sec-sport', '--text']));
  for (const hiker of hikers) {
    const bag = new Mesh(pebble, bagPaint);
    bag.position.set(0, 0.08, -0.36);
    bag.scale.set(0.42, 0.5, 0.26);
    hiker.joints.body.add(bag);
  }
  const framePaint = paint(tint(['--ctp-yellow', '--text']));
  const handle = own(new BoxGeometry(0.05, 0.3, 0.05));
  tennis.forEach((player) => {
    const stick = new Mesh(handle, framePaint);
    stick.position.y = -0.7;
    const head = new Mesh(pebble, framePaint);
    head.position.y = -1.0;
    head.scale.set(0.1, 0.42, 0.34);
    player.joints.flipperR.add(stick, head);
  });
  const placeCourt = (players: Penguin[], court: typeof TENNIS, margin: number): void => {
    players.forEach((player, i) => {
      const side = i === 0 ? -1 : 1;
      player.root.position.set(court.x + side * (court.length / 2 - margin), 0, court.z);
      player.root.rotation.y = -side * FACE;
    });
  };
  placeCourt(tennis, TENNIS, 1);
  placeCourt(volley, VOLLEY, 1.2);

  const tennisBall = new Mesh(
    own(new IcosahedronGeometry(0.12, 1)),
    paint(tint(['--ctp-yellow', '--text'])),
  );
  const volleyBall = new Mesh(own(new IcosahedronGeometry(0.22, 1)), paint(text));
  scene.add(tennisBall, volleyBall);

  const ambient = new AmbientLight(text, 0.9);
  const sun = new DirectionalLight(text, 1.7);
  sun.position.set(-30, 40, 30);
  scene.add(ambient, sun);

  // --- Stato ------------------------------------------------------------------------------------
  const names = moments.length > 0 ? moments : ['overview'];
  const hikingMoment = Math.max(0, names.indexOf('hiking'));
  let storyTarget = 0;
  let story = 0;
  let time = STILL_TIME;
  let size = { width: 1, height: 1 };
  /** Verso degli escursionisti: 0 in salita, Math.PI quando si scorre indietro. */
  let hikerTurn = 0;
  let hikerGoal = 0;

  /** Inclina `root` lungo il pendio nella direzione `heading`: i piedi seguono il terreno. */
  const onSlope = (p: Penguin, x: number, z: number, heading: number): void => {
    const y = heightAt(x, z);
    const dx = Math.sin(heading) * 0.8;
    const dz = Math.cos(heading) * 0.8;
    p.root.position.set(x, y, z);
    p.root.rotation.set(Math.atan2(y - heightAt(x + dx, z + dz), 0.8), heading, 0, 'YXZ');
  };

  const placeCharacters = (): void => {
    // Sciatore: a curve lungo la pista, la traccia finisce sotto di lui.
    const { run, melted } = descentAt(time);
    const here = trackAt(skiTrack, run);
    const ahead = trackAt(skiTrack, run + 0.03);
    skier.setPose('ski', Math.max(-1, Math.min(1, (ahead.heading - here.heading) * 1.5)));
    onSlope(skier, here.x, here.z, here.heading);
    const start = Math.floor((melted * traceFaces) / 6) * 6;
    trace.setDrawRange(start, Math.floor((run * traceFaces) / 6) * 6 - start);

    // Escursionisti: posizione dallo scroll, fermi quando lo scroll e fermo.
    const climb = climbAt(story, hikingMoment);
    const moving = story !== storyTarget && climb > 0 && climb < 1;
    hikers.forEach((hiker, i) => {
      const t = climb * (1 - HIKER_GAP) + HIKER_GAP * (1 - i);
      const p = trackAt(trailTrack, t);
      if (moving) hiker.setPose('run', (t * STRIDES) % 1);
      else hiker.setPose('stand');
      onSlope(hiker, p.x, p.z, p.heading);
      hiker.root.rotation.y = p.heading + hikerTurn;
    });

    // Tennis: la pallina rimbalza nel campo, la racchetta accompagna il colpo.
    const rally = rallyAt(time, TENNIS_SHOT);
    const reach = TENNIS.length / 2 - 1.5;
    tennisBall.position.set(
      TENNIS.x + rally.along * reach,
      tennisBallY(rally.shot, TENNIS_CONTACT),
      TENNIS.z + 0.3,
    );
    tennis.forEach((player, i) => {
      player.setPose('stand');
      player.joints.flipperR.rotation.x = -1.2 * (rally.swing[i] ?? 0) - 0.3;
    });

    // Pallavolo: il pallone passa sopra la rete, da un bagher all'altro.
    const pass = rallyAt(time, VOLLEY_SHOT);
    const span = VOLLEY.length / 2 - 1.75;
    volleyBall.position.set(
      VOLLEY.x + pass.along * span,
      volleyBallY(pass.shot, VOLLEY_CONTACT, VOLLEY_PEAK),
      VOLLEY.z,
    );
    volleyBall.rotation.z = time * 2;
    volley.forEach((player, i) => {
      player.setPose('bagher', 0.35 + 0.65 * (pass.swing[i] ?? 0));
    });
  };

  const place = (): void => {
    const portrait = size.width < size.height;
    const table = shotsFor(portrait);
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
    placeCharacters();
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  // Finche la scena e visibile gira il ciclo d'ambiente; ferma (fuori schermo o meno movimento)
  // nessun fotogramma in coda.
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    time += dt;
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    hikerTurn += (hikerGoal - hikerTurn) * Math.min(1, dt * TURN);
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
      const next = Math.max(0, position);
      if (Math.abs(next - storyTarget) > EPSILON) hikerGoal = next > storyTarget ? 0 : Math.PI;
      storyTarget = next;
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
