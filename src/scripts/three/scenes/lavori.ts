import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
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
import { type Block, buildCourse, cardFraming, fitDistance, runnerAt } from '../lavori/course';
import { createPenguin } from '../penguin';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Lavori (spec §13), immersiva (PORT-83): un percorso a piattaforme visto di lato. Un
 * livello per esperienza, nell'ordine delle schede, costruito dagli ostacoli indicati nei dati
 * (../lavori/course.ts). Il pinguino corre, salta, viaggia sul nastro e alla fine saluta da solo:
 * nessun comando, la sua posizione e una funzione pura dello scroll, avanti e indietro. La camera
 * lo segue di lato. Solo forme generiche, tutto procedurale, colori dai token.
 * Senza racconto (nessun `setStory`) resta ferma sulla prima schermata.
 */

/** Rincorsa del racconto verso la posizione chiesta dallo scroll (1/s); poi nessun fotogramma. */
const STORY_CATCH_UP = 4;
const EPSILON = 0.0005;
/** Profondita del percorso (Z) e spessore del terreno sotto il piano. */
const DEPTH = 1.5;
const SOIL = 0.6;
/** Il pinguino corre verso +X, girato un po' verso la camera: si vedono pancia e becco. */
const FACING = Math.PI / 2 - 0.55;
/** Passo delle strisce sul nastro. */
const STRIPE = 0.5;

interface Framing {
  /** Punto inquadrato rispetto al pinguino (X) e larghezza da tenere in vista (unita). */
  lead: number;
  span: number;
  shift: number;
  lift: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

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
  const camera = new PerspectiveCamera(35, 1, 0.1, 160);

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
  /** Materiali per livello: accento pieno, accento tenue, luce (finestre, bandiera, strisce). */
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

  // --- Blocchi ----------------------------------------------------------------------------------
  /** Parti mobili, aggiornate a ogni fotogramma dal punto del pinguino. */
  const flags: { mesh: Mesh; x: number; top: number }[] = [];
  const belts: { stripes: Mesh[]; x0: number; x1: number }[] = [];
  const drawers: Record<Block['kind'], (b: Block) => void> = {
    ground(b) {
      box(m.soil, b.x0, b.x1, -SOIL, 0);
      // Bordo del piano nel colore del livello: si vede dove inizia e finisce ogni esperienza.
      box(paintOf(b.level).muted, b.x0, b.x1, -0.08, 0.02, DEPTH / 2 - 0.04, 0.1);
    },
    step(b) {
      box(paintOf(b.level).muted, b.x0, b.x1, 0, b.top, 0, DEPTH * 0.8);
    },
    crate(b) {
      // Container: uno o due impilati, con le nervature verticali sul fronte.
      const p = paintOf(b.level);
      const rows = b.top > 0.6 ? 2 : 1;
      for (let k = 0; k < rows; k += 1) {
        const y0 = (b.top / rows) * k;
        const y1 = (b.top / rows) * (k + 1);
        box(k % 2 ? p.muted : p.full, b.x0, b.x1, y0, y1 - 0.02, 0, DEPTH * 0.75);
        for (let x = b.x0 + 0.17; x < b.x1 - 0.1; x += 0.2) {
          box(m.dark, x, x + 0.03, y0 + 0.07, y1 - 0.09, DEPTH * 0.375, 0.03);
        }
      }
    },
    wall(b) {
      // Firewall: muro di mattoni con le righe di malta e il coronamento.
      box(m.wall, b.x0, b.x1, 0, b.top, 0, DEPTH * 0.9);
      for (let y = 0.24; y < b.top; y += 0.24) {
        box(m.mortar, b.x0 - 0.01, b.x1 + 0.01, y - 0.015, y + 0.015, 0, DEPTH * 0.9 + 0.02);
      }
      box(m.mortar, b.x0 - 0.03, b.x1 + 0.03, b.top - 0.02, b.top + 0.06, 0, DEPTH * 0.95);
    },
    belt(b) {
      // Nastro CI/CD: piano con rulli alle estremita e strisce che scorrono sotto il pinguino.
      box(m.neutral, b.x0 + 0.1, b.x1 - 0.1, 0, b.top - 0.12, 0, DEPTH * 0.6);
      box(m.dark, b.x0, b.x1, b.top - 0.12, b.top, 0, DEPTH * 0.7);
      const roller = own(new CylinderGeometry(0.14, 0.14, DEPTH * 0.72, 8).rotateX(Math.PI / 2));
      for (const x of [b.x0 + 0.1, b.x1 - 0.1]) {
        const mesh = new Mesh(roller, m.neutral);
        mesh.position.set(x, b.top - 0.12, 0);
        root.add(mesh);
      }
      const glow = paintOf(b.level).glow;
      const stripes: Mesh[] = [];
      for (let x = b.x0; x < b.x1 - STRIPE / 2; x += STRIPE) {
        stripes.push(box(glow, x, x + 0.14, b.top - 0.01, b.top + 0.01, 0, DEPTH * 0.66));
      }
      belts.push({ stripes, x0: b.x0, x1: b.x1 });
    },
    pole(b) {
      box(m.snow, b.x0, b.x1, 0, b.top, -0.3, 0.1);
      blob(m.snow, (b.x0 + b.x1) / 2, b.top + 0.05, -0.3, 0.16);
      const flag = box(paintOf(b.level).glow, b.x1, b.x1 + 0.55, 0, 0.36, -0.3, 0.04);
      flags.push({ mesh: flag, x: b.x0, top: b.top });
    },
    site(b) {
      // Sito: un pilastro e, in fondo, una casetta con le finestre accese.
      const p = paintOf(b.level);
      box(p.muted, b.x0, b.x1, -SOIL, b.top, 0, DEPTH * 0.85);
      if (b.x1 - b.x0 < 1.5) return;
      const mid = (b.x0 + b.x1) / 2;
      const back = -DEPTH * 0.32;
      box(p.full, mid - 0.45, mid + 0.45, b.top, b.top + 0.75, back, 0.5);
      const roof = new Mesh(own(new ConeGeometry(0.72, 0.4, 4).rotateY(Math.PI / 4)), m.neutral);
      roof.position.set(mid, b.top + 0.95, back);
      roof.scale.z = 0.5;
      root.add(roof);
      for (const dx of [-0.2, 0.2]) {
        box(p.glow, mid + dx - 0.09, mid + dx + 0.09, b.top + 0.3, b.top + 0.5, back + 0.26, 0.02);
      }
    },
    bridge(b) {
      // Ponte DNS: assi sospese tra due coppie di torri, un asse si e uno no in colore, e i cavi.
      const p = paintOf(b.level);
      const planks = 12;
      const w = (b.x1 - b.x0) / planks;
      for (let k = 0; k < planks; k += 1) {
        const y = b.top - 0.18 * Math.sin((Math.PI * (k + 0.5)) / planks);
        const x = b.x0 + k * w;
        box(k % 2 ? p.full : m.neutral, x + 0.02, x + w - 0.02, y - 0.1, y, 0, DEPTH * 0.55);
      }
      const side = DEPTH * 0.3;
      for (const x of [b.x0, b.x1]) {
        for (const z of [-side, side])
          box(m.neutral, x - 0.07, x + 0.07, b.top, b.top + 1.1, z, 0.14);
      }
      // Cavi: segmenti dritti dalla cima delle torri all'avvallamento centrale.
      const mid = (b.x0 + b.x1) / 2;
      const high = b.top + 1.05;
      const low = b.top + 0.25;
      for (const z of [-side, side]) {
        for (const [xa, ya, xb, yb] of [
          [b.x0, high, mid, low],
          [mid, low, b.x1, high],
        ] as const) {
          const cable = box(p.glow, 0, 1, -0.02, 0.02, z, 0.03);
          cable.position.set((xa + xb) / 2, (ya + yb) / 2, z);
          cable.scale.x = Math.hypot(xb - xa, yb - ya);
          cable.rotation.z = Math.atan2(yb - ya, xb - xa);
        }
      }
    },
    garden(b) {
      // Giardino del volontariato: prato nel colore del livello, cespugli e fiori in fondo.
      const p = paintOf(b.level);
      box(m.soil, b.x0, b.x1, -SOIL, -0.06);
      box(p.muted, b.x0, b.x1, -0.06, 0);
      for (let x = b.x0 + 0.5, k = 0; x < b.x1 - 0.3; x += 0.9, k += 1) {
        blob(m.leaf, x, 0.2, -DEPTH * 0.38, 0.55 - (k % 2) * 0.15, 0.45);
        blob(k % 2 ? m.flower : p.glow, x + 0.42, 0.12, -DEPTH * 0.18, 0.12);
      }
    },
    goal(b) {
      // Meta: un igloo basso con la porta scura.
      const mid = (b.x0 + b.x1) / 2;
      const radius = (b.x1 - b.x0) / 2;
      const dome = new Mesh(
        own(new SphereGeometry(radius, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)),
        m.snow,
      );
      dome.position.set(mid, 0, -DEPTH * 0.15);
      root.add(dome);
      box(m.dark, mid - 0.18, mid + 0.18, 0, 0.38, -DEPTH * 0.15 + radius - 0.05, 0.12);
    },
  };
  for (const b of course.blocks) drawers[b.kind](b);

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
  let size = { width: 1, height: 1 };
  const names = moments.length > 0 ? moments : ['overview'];

  /** Inquadratura del momento `index`: prima schermata e uscita larghe, le schede di lato. */
  const framing = (index: number): Framing => {
    const name = names[index] ?? 'overview';
    const portrait = size.width < size.height;
    if (name === 'overview') {
      return { lead: portrait ? 1.2 : 3.4, span: portrait ? 5.5 : 11.5, shift: 0, lift: 0 };
    }
    if (name === 'exit') return { lead: 0.8, span: portrait ? 6 : 8, shift: 0, lift: 0 };
    return { lead: portrait ? 0.9 : 0.5, span: portrait ? 5.5 : 8.5, ...cardFraming(size.width) };
  };

  const place = (): void => {
    const runner = runnerAt(course, story);
    penguin.setPose(runner.pose, runner.phase);
    penguin.root.position.set(runner.x, runner.y, 0);
    // Di tre quarti verso la camera mentre corre; per salutare si gira del tutto verso chi guarda.
    penguin.root.rotation.y = mix(
      FACING,
      0.15,
      runner.pose === 'wave' ? clamp01(runner.phase * 2) : 0,
    );

    for (const flag of flags) {
      // La bandiera sale mentre il pinguino passa davanti al palo, e riscende tornando indietro.
      const up = clamp01((runner.x - flag.x + 0.6) / 1.6);
      flag.mesh.position.y = mix(0.3, flag.top - 0.25, up);
    }
    for (const belt of belts) {
      // Le strisce scorrono con il pinguino mentre e sul nastro.
      const length = belt.x1 - belt.x0 - 0.2;
      const offset = clamp01((runner.x - belt.x0) / (belt.x1 - belt.x0)) * 3.2;
      belt.stripes.forEach((stripe, k) => {
        stripe.position.x = belt.x0 + 0.17 + ((k * STRIPE + offset) % length);
      });
    }

    const { from, to, t } = blendAt(story, names.length);
    const a = framing(from);
    const b = framing(to);
    const at = (key: keyof Framing) => mix(a[key], b[key], t);
    const aspect = size.width / size.height;
    const portrait = aspect < 1;
    const distance = fitDistance(portrait ? 5.2 : 3.8, at('span'), aspect, camera.fov);
    // Camera di lato, appena spostata e alzata: si vede la profondita del percorso.
    const tx = runner.x + at('lead');
    const ty = 0.75 + runner.y * 0.3;
    camera.position.set(tx + distance * 0.2, ty + distance * 0.16, distance);
    camera.lookAt(tx, ty, 0);
    // Schermo largo: percorso a destra delle schede. Schermo stretto: percorso sopra la scheda.
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
  // Il ciclo gira solo finche il racconto rincorre lo scroll: a riposo nessun fotogramma.
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
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw();
    if (story === storyTarget) {
      frame = 0;
      last = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  /** Ridisegna: subito se ferma o statica, altrimenti avvia la rincorsa. */
  const kick = (): void => {
    if (disposed) return;
    if (running && tier === 'full' && story !== storyTarget) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else if (!frame) {
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
      storyTarget = Math.max(0, position);
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
