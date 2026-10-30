import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { cardFraming, fitDistance } from '../lavori/course';
import { buildCity, CROSSING, type DistrictInput, ROWS, walkerAt } from '../opensource/city';
import { createPenguin } from '../penguin';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Open source (PORT-89), immersiva: una citta low-poly vista di lato, un quartiere per gruppo
 * di repository e un edificio per repository, piu alto con piu stelle (../opensource/city.ts). Il
 * pinguino la attraversa sul viale: la sua posizione e una funzione pura dello scroll, avanti e
 * indietro, e alla fine saluta. Il quartiere del momento ha le finestre accese, gli altri restano
 * in penombra. La camera passa da un'inquadratura all'altra solo per interpolazione.
 * Tutto procedurale (solo primitive), colori dai token. Senza racconto resta sulla prima schermata.
 */

/** Rincorsa del racconto verso la posizione chiesta dallo scroll (1/s); poi nessun fotogramma. */
const STORY_CATCH_UP = 4;
const EPSILON = 0.0005;
/** Velocita con cui il pinguino si gira (1/s). */
const TURN = 10;
/** Luce dei quartieri: panoramica e uscita, quartiere del momento, gli altri. */
const LIT = { all: 0.75, on: 1, off: 0.18 };
/** Accenti dei quartieri, nell'ordine e ciclici. */
const ACCENTS = [
  '--sec-sport',
  '--sec-certificazioni',
  '--sec-domotica-alt',
  '--sec-homelab',
  '--sec-interessi',
  '--sec-beneficenza',
  '--sec-lavori',
] as const;
/** Quota minima della camera. */
const MIN_Y = 0.8;

interface Framing {
  /** Punto guardato (X, Y) e porzione di scena da tenere in vista (unita). */
  tx: number;
  ty: number;
  span: number;
  height: number;
  shift: number;
  lift: number;
}

interface Volume {
  x: number;
  z: number;
  y0: number;
  y1: number;
  w: number;
  d: number;
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
  const districts = (data as { districts?: DistrictInput[] } | undefined)?.districts ?? [];
  if (districts.length === 0) throw new Error('opensource: dati della scena assenti');
  const city = buildCity(districts);
  const count = city.blocks.length;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 1, 240);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const text = tint(['--text']);
  const deep = tint(['--bg-deep', '--bg']);
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
    road: paint(soft(deep, 0.6)),
    walk: paint(tint(['--surface-hi', '--surface'])),
    dash: paint(soft(text, 0.6)),
    dark: paint(deep),
    trunk: paint(soft(text, 0.3)),
    leaf: paint(soft(tint(['--ctp-green', '--text']), 0.7)),
    lamp: paint(tint(['--ctp-yellow', '--text']), 0.9),
    ground: paint(soft(deep, 0.85)),
  };

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
    z: number,
    depth: number,
  ): Mesh => {
    const mesh = new Mesh(cube, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    mesh.scale.set(x1 - x0, y1 - y0, depth);
    root.add(mesh);
    return mesh;
  };

  // --- Viale, mezzeria e marciapiede (ognuno compenetra il vicino: nessuna faccia complanare) ----
  // Terreno sotto a tutto, fino all'orizzonte e dietro la camera: nessun oggetto galleggia.
  box(m.ground, -80, city.length + 80, -1, -0.06, 83, 234);
  box(m.road, -4, city.length + 4, -0.5, 0, 0, 2.2);
  for (let x = -3; x < city.length + 3; x += 1.6) box(m.dash, x, x + 0.8, -0.01, 0.015, -0.6, 0.1);
  box(m.walk, -3.9, city.length + 3.9, -0.3, 0.06, -1.29, 0.42);

  // --- Quartieri: materiali in penombra variabile, piastra, edifici, finestre ---------------------
  /** Materiale con colore pieno `base` e intensita emissiva `glow`, che la luce del momento attenua. */
  const shaded: { material: MeshStandardMaterial; base: Color; glow: number }[] = [];
  const shade = (base: Color, glow = 0) => {
    const material = paint(base.clone(), glow);
    shaded.push({ material, base, glow });
    return material;
  };
  const windowGeometry = own(new BoxGeometry(0.14, 0.18, 0.03));
  const dummy = new Object3D();
  const windowSets: { material: MeshBasicMaterial }[] = [];
  const trunkTop = 0.35;
  const treeGeometry = own(new ConeGeometry(0.4, 1, 5));

  /** Volumi (impilati o no) di un edificio: i successivi entrano di 0,02 in quello sotto. */
  const volumesOf = (b: (typeof city.buildings)[number]): Volume[] => {
    const { x, z, width: w, depth: d, height: h } = b;
    if (b.style === 1) {
      const cuts = [0, 0.4, 0.75, 1];
      return [0, 1, 2].map((i) => ({
        x,
        z,
        y0: h * (cuts[i] ?? 0) - (i ? 0.02 : 0),
        y1: h * (cuts[i + 1] ?? 1),
        w: w * (1 - 0.2 * i),
        d: d * (1 - 0.2 * i),
      }));
    }
    if (b.style === 2) {
      return [
        { x, z, y0: 0, y1: h * 0.8, w, d },
        { x, z, y0: h * 0.8 - 0.02, y1: h, w: w * 0.6, d: d * 0.6 },
      ];
    }
    return [{ x, z, y0: 0, y1: h, w, d }];
  };

  city.blocks.forEach((block, d) => {
    const accent = tint([ACCENTS[d % ACCENTS.length] ?? '--text', '--text']);
    const wall = shade(tint(['--surface-hi', '--surface']).lerp(accent, 0.3), 0.08);
    const glow = shade(accent, 1);
    const plate = shade(soft(accent, 0.22));
    // La fila davanti piu chiara: si stacca dalle torri dietro.
    const front = shade(tint(['--surface-hi', '--surface']).lerp(accent, 0.5), 0.08);
    const yellow = tint(['--ctp-yellow', '--text']);
    box(plate, block.x0, block.x1, -0.25, 0.03, -3.025, 3.15);

    const mine = city.buildings.filter((b) => b.district === d);
    const lights: { x: number; y: number; z: number; ry: number; color: Color }[] = [];
    let n = 0;
    for (const b of mine) {
      const k = city.buildings.indexOf(b);
      const volumes = volumesOf(b);
      for (const v of volumes) {
        const skin = b.z === ROWS.front ? front : wall;
        box(skin, v.x - v.w / 2, v.x + v.w / 2, v.y0, v.y1, v.z, v.d);
        // Finestre: griglia sulla faccia frontale (+Z) e su quella destra (+X).
        const faces: [number, number, number][] = [
          [v.w, v.z + v.d / 2 + 0.01, 0],
          [v.d, v.x + v.w / 2 + 0.01, Math.PI / 2],
        ];
        for (const [length, offset, ry] of faces) {
          const columns = Math.floor((length - 0.16) / 0.3);
          for (let c = 0; c < columns; c += 1) {
            const along = (c - (columns - 1) / 2) * 0.3;
            for (let y = v.y0 + 0.3; y + 0.18 <= v.y1 - 0.12; y += 0.4) {
              const hash = (n * 7 + k * 13) % 5;
              n += 1;
              const color = hash === 0 ? yellow : hash < 3 ? accent : deep;
              lights.push(
                ry
                  ? { x: offset, y: y + 0.09, z: v.z + along, ry, color }
                  : { x: v.x + along, y: y + 0.09, z: offset, ry, color },
              );
            }
          }
        }
      }
      const top = volumes[volumes.length - 1] ?? { y1: b.height };
      if (b.height > 2) {
        // Antenna con la luce in punta.
        box(m.dark, b.x + 0.12, b.x + 0.18, top.y1 - 0.02, top.y1 + 0.55, b.z, 0.05);
        box(glow, b.x + 0.1, b.x + 0.2, top.y1 + 0.5, top.y1 + 0.62, b.z, 0.1);
      } else {
        box(m.dark, b.x - 0.25, b.x + 0.15, top.y1 - 0.02, top.y1 + 0.22, b.z, 0.3);
      }
    }
    // Alberelli sulla piastra dove c'e posto: i quartieri con un solo edificio non restano vuoti.
    if (mine.length === 1) {
      for (const [dx, z] of [
        [0.55, -2.6],
        [block.x1 - block.x0 - 0.55, -2.2],
      ] as const) {
        const x = block.x0 + dx;
        box(m.trunk, x - 0.05, x + 0.05, 0, trunkTop, z, 0.1);
        const crown = new Mesh(treeGeometry, m.leaf);
        crown.position.set(x, trunkTop - 0.05 + 0.5, z);
        root.add(crown);
      }
    }

    const material = own(new MeshBasicMaterial());
    const windows = own(new InstancedMesh(windowGeometry, material, lights.length));
    lights.forEach((light, i) => {
      dummy.position.set(light.x, light.y, light.z);
      dummy.rotation.set(0, light.ry, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(i, dummy.matrix);
      windows.setColorAt(i, light.color);
    });
    root.add(windows);
    windowSets[d] = { material };
  });

  // --- Lampioni nei varchi, sul marciapiede ---------------------------------------------------------
  for (const block of city.blocks) {
    const x = block.x1 + CROSSING / 2;
    box(m.dark, x - 0.03, x + 0.03, 0.04, 1.5, -1.3, 0.06);
    box(m.lamp, x - 0.1, x + 0.1, 1.46, 1.56, -1.3, 0.2);
  }

  // Sfondo: sagome piatte e tenui, poggiate sul terreno, un'unica InstancedMesh lungo tutta la citta.
  const skyline = Math.ceil((city.length + 16) / 2.2);
  const far = own(
    new InstancedMesh(
      cube,
      own(new MeshBasicMaterial({ color: soft(tint(['--ctp-sky', '--text']), 0.07) })),
      skyline,
    ),
  );
  for (let k = 0; k < skyline; k += 1) {
    const h = 1.5 + ((k * 7) % 5) * 0.9;
    dummy.position.set(-8 + k * 2.2, h / 2 - 0.5, -16 - ((k * 7) % 5) * 1.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.6 + (k % 3) * 0.4, h, 3);
    dummy.updateMatrix();
    far.setMatrixAt(k, dummy.matrix);
  }
  root.add(far);

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

  /** Inquadratura del momento `index`: panoramica, un quartiere (scheda di lato) o l'uscita. */
  const framing = (index: number): Framing => {
    const portrait = size.width < size.height;
    const block = index >= 1 && index <= count ? city.blocks[index - 1] : undefined;
    if (block) {
      const length = block.x1 - block.x0;
      return {
        tx: (block.x0 + block.x1) / 2,
        // Schermo stretto: resta libera solo la fascia sopra la scheda, il viale deve stare li.
        ty: portrait ? 0.7 : 2.3,
        span: portrait ? Math.max(9, length * 1.15) : Math.max(12, length * 1.7),
        height: portrait ? 5 : 8.5,
        ...cardFraming(size.width),
      };
    }
    if (index > count) {
      const tx = (city.stops[city.stops.length - 1] ?? 0) + 0.5;
      return { tx, ty: 1.6, span: portrait ? 6 : 9, height: 5, shift: 0, lift: 0 };
    }
    // Prima schermata: i primi quartieri di fianco alla scheda, il resto della citta prosegue oltre.
    const side = cardFraming(size.width).shift > 0;
    return {
      tx: side ? 7.5 : 8,
      ty: portrait ? 1.5 : 3,
      span: side ? 30 : 16,
      height: portrait ? 9 : 11,
      shift: side ? 0.4 : 0,
      lift: portrait ? 0.25 : 0,
    };
  };

  /** Luce del quartiere `d` nel momento `index`. */
  const litAt = (index: number, d: number): number =>
    index >= 1 && index <= count ? (index - 1 === d ? LIT.on : LIT.off) : LIT.all;

  /** Verso a cui il pinguino deve girarsi in questo punto del racconto. */
  const targetYaw = (pose: string): number => (pose === 'wave' ? YAW.wave : YAW[heading]);

  const place = (): void => {
    const walker = walkerAt(city, story);
    penguin.setPose(walker.pose, walker.phase);
    penguin.root.position.set(walker.x, 0, 0.2);
    penguin.root.rotation.y = yaw;

    const { from, to, t } = blendAt(story, names.length);
    // Luce per quartiere, interpolata tra i due momenti.
    const lit = districts.map((_, d) => mix(litAt(from, d), litAt(to, d), t));
    city.blocks.forEach((_, d) => {
      const level = lit[d] ?? LIT.all;
      for (const entry of shaded.slice(d * 4, d * 4 + 4)) {
        entry.material.color.lerpColors(surface, entry.base, 0.35 + 0.65 * level);
        entry.material.emissiveIntensity = entry.glow * level;
      }
      windowSets[d]?.material.color.setScalar(0.35 + 0.65 * level);
    });

    const a = framing(from);
    const b = framing(to);
    const at = (key: keyof Framing) => mix(a[key], b[key], t);
    const aspect = size.width / size.height;
    const distance = fitDistance(at('height'), at('span'), aspect, camera.fov);
    camera.position.set(
      at('tx') + distance * 0.2,
      Math.max(MIN_Y, at('ty') + distance * 0.2),
      distance,
    );
    camera.lookAt(at('tx'), at('ty'), -1);
    // Schermo largo: citta a destra delle schede. Schermo stretto: citta sopra la scheda.
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
    story === storyTarget && yaw === targetYaw(walkerAt(city, story).pose);
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    const goal = targetYaw(walkerAt(city, story).pose);
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
      yaw = targetYaw(walkerAt(city, story).pose);
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
