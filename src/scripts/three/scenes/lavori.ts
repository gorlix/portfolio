import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import type { WorkCourse } from '../../../lib/work';
import { pixelRatioFor } from '../capabilities';
import { buildCourse, cardFraming, fitDistance, type Prop, runnerAt } from '../lavori/course';
import { createPenguin } from '../penguin';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Lavori (spec §13), immersiva (PORT-83): una strada piana vista di lato, una striscia per
 * esperienza nell'ordine delle schede, con la scenografia del livello a lato (../lavori/course.ts).
 * Il pinguino cammina da solo, con un saltello basso tra un livello e l'altro, e alla fine saluta:
 * nessun comando, la sua posizione e una funzione pura dello scroll, avanti e indietro. Si gira
 * nel verso dello scroll; la camera resta a quota fissa e lo segue solo in X. Solo forme
 * generiche, tutto procedurale, colori dai token.
 * Senza racconto (nessun `setStory`) resta ferma sulla prima schermata.
 */

/** Rincorsa del racconto verso la posizione chiesta dallo scroll (1/s); poi nessun fotogramma. */
const STORY_CATCH_UP = 4;
const EPSILON = 0.0005;
/** Velocita con cui il pinguino si gira (1/s). */
const TURN = 10;
/** Profondita della strada, spessore del terreno, fila della scenografia (Z, dietro la strada). */
const DEPTH = 1.4;
const SOIL = 0.5;
const BACK = -1.5;
/** Quota fissa a cui guarda la camera. */
const EYE_Y = 0.75;

interface Framing {
  /** Punto inquadrato rispetto al pinguino (X) e larghezza da tenere in vista (unita). */
  lead: number;
  span: number;
  shift: number;
  lift: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Verso del pinguino: profilo verso +X (avanti) o -X (indietro), di fronte per salutare. */
const YAW = { forward: Math.PI / 2, back: -Math.PI / 2, wave: 0.15 };

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const levels = (data as WorkCourse | undefined)?.levels ?? [];
  if (levels.length === 0) throw new Error('lavori: dati della scena assenti');
  const course = buildCourse(levels);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  // Near non troppo piccolo: la camera sta a 8-12 unita, piu precisione di profondita.
  const camera = new PerspectiveCamera(35, 1, 1, 80);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const work = tint(['--sec-lavori', '--text']);
  const volunteer = tint(['--ctp-teal', '--sec-beneficenza', '--text']);
  const red = tint(['--ctp-red', '--danger', '--text']);
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
    soil: paint(soft(tint(['--surface-hi', '--surface']), 0.6)),
    neutral: paint(soft(text, 0.35)),
    snow: paint(soft(text, 0.85)),
    dark: paint(tint(['--bg-deep', '--bg'])),
    wall: paint(red.clone().lerp(surface, 0.25)),
    mortar: paint(soft(red, 0.35)),
    flower: paint(tint(['--ctp-peach', '--text'])),
    leaf: paint(soft(tint(['--ctp-green', '--text']), 0.7)),
    far: paint(soft(tint(['--ctp-sky', '--text']), 0.16)),
  };
  /** Materiali per livello: accento pieno, accento tenue, luce (finestre, bandiera). */
  const levelPaint = levels.map((level) => {
    const accent = level.volunteer ? volunteer : work;
    return {
      full: paint(accent.clone(), 0.12),
      muted: paint(soft(accent, 0.55)),
      glow: paint(accent.clone(), 0.6),
    };
  });
  const startPaint = { full: m.neutral, muted: m.soil, glow: m.snow };
  const paintOf = (level: number) => levelPaint[level] ?? startPaint;

  const cube = own(new BoxGeometry(1, 1, 1));
  const root = new Group();
  scene.add(root);
  /** Parallelepipedo da (x0, y0) a (x1, y1), centrato in `z` con profondita `depth`. */
  const box = (
    material: Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z = 0,
    depth = DEPTH,
  ): Mesh => {
    const mesh = new Mesh(cube, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    mesh.scale.set(x1 - x0, y1 - y0, depth);
    root.add(mesh);
    return mesh;
  };
  const rock = own(new IcosahedronGeometry(0.5, 0));
  const blob = (material: Material, x: number, y: number, z: number, s: number, sy = s): void => {
    const mesh = new Mesh(rock, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(s, sy, s);
    root.add(mesh);
  };

  // --- Strada: una striscia per livello, con il bordo nel colore del livello ---------------------
  for (const strip of course.strips) {
    box(m.soil, strip.x0, strip.x1, -SOIL, 0);
    // Il bordo sporge di 0,02 davanti e sopra il terreno e ai lati: nessuna faccia complanare.
    const edge = paintOf(strip.level).muted;
    box(edge, strip.x0 - 0.02, strip.x1 + 0.02, -0.12, 0.02, DEPTH / 2 - 0.04, 0.12);
  }

  // --- Scenografia: oggetti fermi dietro la strada, uno per voce dei dati -------------------------
  const roof = own(new ConeGeometry(0.72, 0.4, 4).rotateY(Math.PI / 4));
  const props: Record<Prop['kind'], (x: number, level: number) => void> = {
    container(x, level) {
      // Pila di container con le nervature sul fronte.
      const p = paintOf(level);
      const rows: [number, number, number, Material][] = [
        [x - 1.05, x - 0.05, 0, p.full],
        [x + 0.05, x + 1.05, 0, p.muted],
        [x - 0.5, x + 0.5, 0.56, p.full],
      ];
      for (const [x0, x1, y0, material] of rows) {
        box(material, x0, x1, y0, y0 + 0.54, BACK, 0.8);
        for (let rib = x0 + 0.17; rib < x1 - 0.1; rib += 0.2) {
          box(m.dark, rib, rib + 0.03, y0 + 0.08, y0 + 0.46, BACK + 0.41, 0.02);
        }
      }
    },
    firewall(x) {
      // Firewall: muro di mattoni basso con le righe di malta.
      box(m.wall, x - 0.9, x + 0.9, 0, 1.1, BACK, 0.35);
      for (let y = 0.22; y < 1.1; y += 0.22) {
        box(m.mortar, x - 0.91, x + 0.91, y - 0.015, y + 0.015, BACK, 0.37);
      }
    },
    conveyor(x, level) {
      // Nastro CI/CD fermo, con tre pacchi in fila.
      box(m.neutral, x - 1, x + 1, 0, 0.3, BACK, 0.7);
      box(m.dark, x - 1.05, x + 1.05, 0.3, 0.38, BACK, 0.75);
      for (const dx of [-0.6, 0, 0.6]) {
        box(paintOf(level).full, x + dx - 0.18, x + dx + 0.18, 0.38, 0.72, BACK, 0.36);
      }
    },
    flag(x, level) {
      box(m.snow, x - 0.04, x + 0.04, 0, 2, BACK + 0.4, 0.08);
      box(paintOf(level).glow, x + 0.04, x + 0.64, 1.55, 1.95, BACK + 0.4, 0.04);
    },
    site(x, level) {
      // Sito: una casetta con le finestre accese.
      const p = paintOf(level);
      box(p.full, x - 0.5, x + 0.5, 0, 0.8, BACK, 0.7);
      const top = new Mesh(roof, m.neutral);
      top.position.set(x, 1.0, BACK);
      top.scale.z = 0.7;
      root.add(top);
      for (const dx of [-0.22, 0.22]) {
        box(p.glow, x + dx - 0.1, x + dx + 0.1, 0.35, 0.57, BACK + 0.36, 0.02);
      }
    },
    bridge(x, level) {
      // Ponte DNS: un arco basso di assi tra due torri, sullo sfondo.
      const p = paintOf(level);
      for (let k = 0; k < 8; k += 1) {
        const t = (k + 0.5) / 8;
        // Arco basso appoggiato a terra alle due estremita.
        const y = 0.1 + 0.5 * Math.sin(Math.PI * t);
        const x0 = x - 1 + k * 0.25;
        box(k % 2 ? p.full : m.neutral, x0 + 0.02, x0 + 0.23, y - 0.08, y, BACK, 0.5);
      }
      for (const dx of [-1.05, 1.05]) {
        box(m.neutral, x + dx - 0.06, x + dx + 0.06, 0, 0.45, BACK, 0.6);
      }
    },
    garden(x, level) {
      // Giardino del volontariato: cespugli e fiori.
      const p = paintOf(level);
      for (const [dx, s] of [
        [-0.8, 0.5],
        [0, 0.65],
        [0.8, 0.45],
      ] as const) {
        blob(m.leaf, x + dx, s * 0.35, BACK, s, s * 0.8);
      }
      for (const [dx, k] of [
        [-0.4, 0],
        [0.4, 1],
        [1.1, 0],
      ] as const) {
        blob(k ? m.flower : p.glow, x + dx, 0.1, BACK + 0.5, 0.13);
      }
    },
    skyline(x, level) {
      // Citta in miniatura: anticipa la pagina Open source. Torri a distanze diverse, nessuna
      // faccia in comune; le finestre sporgono davvero dalla parete.
      const p = paintOf(level);
      for (const [dx, h, z, material] of [
        [-0.75, 1.1, BACK - 0.3, p.muted],
        [-0.15, 1.9, BACK - 0.05, p.full],
        [0.5, 1.45, BACK - 0.35, p.muted],
        [1.0, 0.8, BACK + 0.1, p.full],
      ] as const) {
        box(material, x + dx - 0.24, x + dx + 0.24, 0, h, z, 0.42);
        for (let y = 0.25; y < h - 0.15; y += 0.32) {
          box(p.glow, x + dx - 0.13, x + dx + 0.13, y, y + 0.13, z + 0.21, 0.03);
        }
      }
    },
    goal(x) {
      // Meta: un igloo basso con la porta scura.
      const dome = new Mesh(
        own(new SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)),
        m.snow,
      );
      dome.position.set(x, 0, -0.6);
      root.add(dome);
      box(m.dark, x - 0.18, x + 0.18, 0, 0.38, -0.05, 0.12);
    },
  };
  for (const prop of course.props) props[prop.kind](prop.x, prop.level);

  // Sfondo: iceberg bassi e lontani, regolari ma non uguali, lungo tutto il percorso.
  const berg = own(new ConeGeometry(1, 1, 5));
  for (let x = -6, k = 0; x < course.length + 8; x += 2.9, k += 1) {
    const mesh = new Mesh(berg, m.far);
    const h = 0.9 + ((k * 7) % 5) * 0.3;
    mesh.position.set(x + ((k * 3) % 4) * 0.4, h / 2 - 0.9, -9 - (k % 3) * 1.6);
    mesh.scale.set(1.6 + (k % 2) * 0.7, h, 1);
    mesh.rotation.y = k;
    root.add(mesh);
  }

  // --- Pinguino ---------------------------------------------------------------------------------
  const penguin = own(
    createPenguin({
      body: tint(['--ctp-surface2', '--surface-hi']),
      belly: text,
      beak: tint(['--ctp-peach', '--text']),
      eye: tint(['--bg-deep', '--bg']),
    }),
  );
  scene.add(penguin.root);

  const ambient = new AmbientLight(text, 0.9);
  const sun = new DirectionalLight(text, 1.6);
  sun.position.set(-4, 9, 7);
  scene.add(ambient, sun);

  // --- Stato ------------------------------------------------------------------------------------
  let storyTarget = 0;
  let story = 0;
  /** Verso del cammino (ultimo noto) e rotazione attuale del pinguino. */
  let heading: keyof typeof YAW = 'forward';
  let yaw = YAW.forward;
  let size = { width: 1, height: 1 };
  const names = moments.length > 0 ? moments : ['overview'];

  /** Inquadratura del momento `index`: prima schermata e uscita larghe, le schede di lato. */
  const framing = (index: number): Framing => {
    const name = names[index] ?? 'overview';
    const portrait = size.width < size.height;
    if (name === 'overview') {
      return { lead: portrait ? 1.2 : 3, span: portrait ? 5.5 : 10.5, shift: 0, lift: 0 };
    }
    if (name === 'exit') return { lead: 0.8, span: portrait ? 5.5 : 8, shift: 0, lift: 0 };
    return { lead: portrait ? 1 : 1.6, span: portrait ? 6 : 10, ...cardFraming(size.width) };
  };

  /** Verso a cui il pinguino deve girarsi in questo punto del racconto. */
  const targetYaw = (pose: string): number => (pose === 'wave' ? YAW.wave : YAW[heading]);

  const place = (): void => {
    const runner = runnerAt(course, story);
    penguin.setPose(runner.pose, runner.phase);
    penguin.root.position.set(runner.x, runner.y, 0);
    penguin.root.rotation.y = yaw;

    const { from, to, t } = blendAt(story, names.length);
    const a = framing(from);
    const b = framing(to);
    const at = (key: keyof Framing) => mix(a[key], b[key], t);
    const aspect = size.width / size.height;
    const distance = fitDistance(aspect < 1 ? 5 : 4.2, at('span'), aspect, camera.fov);
    // Camera di lato, appena spostata e alzata, a quota fissa: segue il pinguino solo in X.
    const tx = runner.x + at('lead');
    camera.position.set(tx + distance * 0.18, EYE_Y + distance * 0.15, distance);
    camera.lookAt(tx, EYE_Y, 0);
    // Schermo largo: strada a destra delle schede. Schermo stretto: strada sopra la scheda.
    camera.setViewOffset(
      size.width,
      size.height,
      -at('shift') * size.width * 0.5,
      at('lift') * size.height,
      size.width,
      size.height,
    );
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  // Il ciclo gira solo finche il racconto rincorre lo scroll (o il pinguino si gira): a riposo
  // nessun fotogramma.
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  const settled = (): boolean =>
    story === storyTarget && yaw === targetYaw(runnerAt(course, story).pose);
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    const goal = targetYaw(runnerAt(course, story).pose);
    yaw = Math.abs(goal - yaw) < 0.01 ? goal : yaw + (goal - yaw) * Math.min(1, dt * TURN);
    draw();
    if (settled()) {
      frame = 0;
      last = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  /** Ridisegna: subito se ferma o statica, altrimenti avvia la rincorsa. */
  const kick = (): void => {
    if (disposed) return;
    if (running && tier === 'full' && !settled()) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else if (!frame) {
      yaw = targetYaw(runnerAt(course, story).pose);
      draw();
    }
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
    setStory(position) {
      const next = Math.max(0, position);
      // Il pinguino guarda dove va: avanti scendendo, indietro risalendo.
      if (Math.abs(next - storyTarget) > EPSILON) heading = next > storyTarget ? 'forward' : 'back';
      storyTarget = next;
      // Statica (o fuori schermo): si salta al momento e si ridisegna una volta.
      if (tier !== 'full' || !running) story = storyTarget;
      kick();
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
