import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { attachOrbit } from '../orbit';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import {
  checkRank,
  greenCount,
  gridOf,
  PAD,
  parseFigures,
  STATIONS,
  series,
  slab,
  stationOf,
} from '../trimind/logic';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Trimind (spec §7.3, PORT-82): una mappa low-poly con cinque stazioni, una per momento
 * (infrastruttura, backup, CI/CD, osservabilita, qualita). La camera vola da una all'altra; la
 * stazione del momento si accende, le altre restano in penombra. Solo forme generiche, nessun
 * testo e nessun dato reale. Le animazioni girano solo a livello 'full' e mentre la scena anima;
 * a 'reduced' un fotogramma fermo per momento. Colori solo dai token del tema.
 */

const MAP_CENTER = new Vector3(0, 0, 1.5);
const MAX_YAW = 0.6;
const SWAY = { amplitude: 0.18, speed: 0.15 };
/** Rincorsa della camera verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 5;
/** Istante del fotogramma fermo a livello 'reduced'. */
const STATIC_AT = 2.2;
/** Luce delle stazioni: panoramica, momento attivo, momenti altrui. */
const LIT = { overview: 0.65, on: 1, off: 0.12 };
/** Spostamento del soggetto (schermo largo) e rialzo (schermo stretto), come nella Domotica. */
const SHIFT = 0.36;
const STATION_LIFT = 0.3;
/** Schermo stretto: la scheda e alta, la stazione resta piccola e in alto. */
const PORTRAIT_ZOOM = 0.5;
const PORTRAIT_LIFT = 0.33;
/** Distanza di una stazione rispetto alla panoramica. */
const STATION_ZOOM = 0.4;

interface Pose {
  target: Vector3;
  yaw: number;
  elevation: number;
  distance: number;
  lift: number;
  lit: number[];
}

/** Materiale (o linea) con il colore pieno e quanto si illumina: la penombra lo sposta verso `dim`. */
interface Part {
  m: MeshStandardMaterial | MeshBasicMaterial | LineBasicMaterial;
  base: Color;
  k: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const figures = parseFigures((data as { figures?: unknown } | undefined)?.figures);
  if (!figures) throw new Error('trimind: dati della scena assenti');
  const full = tier === 'full';

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 220);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const c = {
    plate: tint(['--bg-alt', '--surface']),
    dim: tint(['--surface', '--bg-alt']),
    wall: tint(['--surface-hi', '--surface']),
    line: tint(['--border', '--surface-hi']),
    text: tint(['--text']),
    mute: tint(['--text-muted', '--text']),
    blue: tint(['--sec-lavori', '--text']),
    sky: tint(['--sec-sport', '--text']),
    mauve: tint(['--sec-certificazioni', '--text']),
    peach: tint(['--sec-domotica-alt', '--sec-domotica', '--text']),
    pink: tint(['--sec-interessi', '--text']),
    green: tint(['--sec-homelab', '--text']),
    yellow: tint(['--sec-domotica', '--text']),
    danger: tint(['--danger', '--text']),
  };
  const accents = [c.sky, c.mauve, c.peach, c.pink, c.green];

  // --- Piccoli attrezzi di costruzione ----------------------------------------------------------
  let parts: Part[] = [];
  const mat = (base: Color, k = 0, opacity = 1): MeshStandardMaterial => {
    const m = own(
      new MeshStandardMaterial({
        color: base,
        emissive: base,
        emissiveIntensity: 0,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
    parts.push({ m, base, k });
    return m;
  };
  const wire = (base: Color): LineBasicMaterial => {
    const m = own(new LineBasicMaterial({ color: base }));
    parts.push({ m, base, k: 0 });
    return m;
  };
  /** Materiale piatto (non risente delle luci): impulsi e indicatori. */
  const flat = (base: Color, transparent = false): MeshBasicMaterial => {
    const m = own(new MeshBasicMaterial({ color: base, transparent }));
    parts.push({ m, base, k: 0 });
    return m;
  };
  const cubes = new Map<string, BoxGeometry>();
  const cube = (w: number, h: number, d: number): BoxGeometry => {
    const key = `${w},${h},${d}`;
    let g = cubes.get(key);
    if (!g) {
      g = own(new BoxGeometry(w, h, d));
      cubes.set(key, g);
    }
    return g;
  };
  const put = (
    parent: Object3D,
    geometry: BufferGeometry,
    material: MeshStandardMaterial | MeshBasicMaterial,
    x = 0,
    y = 0,
    z = 0,
  ): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const frame = (
    parent: Object3D,
    geometry: BufferGeometry,
    material: LineBasicMaterial,
    x = 0,
    y = 0,
    z = 0,
  ): void => {
    const edges = new LineSegments(own(new EdgesGeometry(geometry)), material);
    edges.position.set(x, y, z);
    parent.add(edges);
  };
  const segments = (parent: Object3D, points: Vector3[], material: LineBasicMaterial): void => {
    parent.add(new LineSegments(own(new BufferGeometry().setFromPoints(points)), material));
  };
  const spark = own(new SphereGeometry(0.1, 8, 6));
  const matrix = new Matrix4();

  const root = new Group();
  scene.add(root);

  // Piano della mappa e percorso che unisce le stazioni nell'ordine dei momenti.
  const plate = new Mesh(cube(21, 0.3, 22.4), own(new MeshStandardMaterial({ color: c.plate })));
  plate.position.set(0, -0.15, MAP_CENTER.z);
  root.add(plate);
  frame(root, cube(21, 0.3, 22.4), own(new LineBasicMaterial({ color: c.line })), 0, -0.15, 1.5);
  root.add(
    new Line(
      own(new BufferGeometry().setFromPoints(STATIONS.map((s) => new Vector3(s.x, 0.02, s.z)))),
      own(new LineBasicMaterial({ color: c.line })),
    ),
  );

  // --- Le cinque stazioni (coordinate locali, origine sul piano della pedana) ---------------------
  type Update = (lit: number, t: number) => void;

  /** Infrastruttura: VPS chiusa con i container, un solo tunnel verso il cloud con scudo. */
  const infra = (g: Group, a: Color): Update => {
    const body = cube(2.4, 1.7, 2.2);
    put(g, body, mat(c.wall, 0, 0.3), -1.5, 0.85, 0);
    frame(g, body, wire(a), -1.5, 0.85, 0);
    const n = figures.services;
    const cols = 5;
    const rows = Math.ceil(n / cols);
    const containers = own(new InstancedMesh(cube(0.3, 0.3, 0.3), mat(a, 0.6), n));
    for (let i = 0; i < n; i += 1) {
      matrix.makeTranslation(
        -1.5 + ((i % cols) - (cols - 1) / 2) * 0.4,
        0.35,
        (Math.floor(i / cols) - (rows - 1) / 2) * 0.4,
      );
      containers.setMatrixAt(i, matrix);
    }
    g.add(containers);
    // Lucchetto sulla parete piena: nessuna porta aperta.
    const lock = mat(c.yellow, 0.5);
    put(g, cube(0.46, 0.36, 0.14), lock, -1.5, 0.62, 1.17);
    put(g, own(new TorusGeometry(0.13, 0.04, 6, 10, Math.PI)), lock, -1.5, 0.8, 1.17);
    // Nuvola low-poly con scudo (Zero Trust).
    const cloud = new Group();
    cloud.position.set(2.7, 2.1, -0.6);
    const puff = own(new IcosahedronGeometry(1, 1));
    const cloudMat = mat(c.text, 0.12);
    for (const [x, y, z, r] of [
      [0, 0, 0, 0.7],
      [-0.7, -0.15, 0.05, 0.5],
      [0.7, -0.1, 0, 0.55],
      [0.1, 0.35, -0.1, 0.5],
    ] as const)
      put(cloud, puff, cloudMat, x, y, z).scale.set(r, r * 0.8, r);
    g.add(cloud);
    const outline = new Shape(
      [
        [0, 0.5],
        [0.4, 0.34],
        [0.4, -0.05],
        [0, -0.5],
        [-0.4, -0.05],
        [-0.4, 0.34],
      ].map(([x, y]) => new Vector2(x, y)),
    );
    put(
      g,
      own(new ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: false })),
      mat(c.green, 0.8),
      2.7,
      1.95,
      0.2,
    );
    // Un solo tunnel dalla VPS al cloud, con impulsi che lo percorrono.
    const path = new CatmullRomCurve3([
      new Vector3(-0.3, 0.9, -0.3),
      new Vector3(0.6, 0.6, -0.5),
      new Vector3(1.6, 1.2, -0.6),
      new Vector3(2.3, 1.7, -0.6),
    ]);
    put(g, own(new TubeGeometry(path, 28, 0.06, 6)), mat(a, 0.7));
    const pulseMat = flat(c.text);
    const pulses = [0, 1, 2].map(() => put(g, spark, pulseMat));
    return (lit, t) => {
      pulses.forEach((p, i) => {
        p.position.copy(path.getPoint((t * 0.3 + i / 3) % 1));
        p.visible = lit > 0.3;
      });
    };
  };

  /** Backup: snapshot dalla VPS a un bucket; oltre la retention sfumano (GDPR art. 17). */
  const backup = (g: Group, a: Color): Update => {
    const ret = figures.retentionDays;
    const count = ret + 5;
    const step = 0.28;
    const x0 = -2;
    const vps = cube(1.2, 1, 1.2);
    put(g, vps, mat(c.wall, 0, 0.3), -3.2, 0.5, 0);
    frame(g, vps, wire(a), -3.2, 0.5, 0);
    const length = (count + 1) * step;
    const cx = x0 + length / 2 - step;
    put(g, cube(length, 0.1, 1.3), mat(c.wall), cx, 0.05, 0);
    frame(g, cube(length, 1.1, 1.4), wire(a), cx, 0.55, 0);
    // Orizzonte della retention: oltre questo cancello gli snapshot sfumano.
    put(g, cube(0.05, 1.2, 1.4), mat(c.danger, 0.7), x0 + (ret + 0.5) * step, 0.6, 0);
    const slabGeo = cube(0.1, 0.8, 0.9);
    const slabs = Array.from({ length: count }, () => {
      // Opacita < 1 fin dall'inizio: il materiale nasce trasparente e la cambia ogni fotogramma.
      const m = mat(a, 0.5, 0.99);
      return { m, mesh: put(g, slabGeo, m) };
    });
    return (lit, t) => {
      const phase = (t * 0.3) % 1;
      slabs.forEach((s, k) => {
        const age = (k + phase) % count;
        const state = slab(age, ret);
        s.mesh.position.set(x0 + age * step, 0.1 + 0.4 * state.scale, 0);
        s.mesh.scale.y = Math.max(0.001, state.scale);
        s.m.opacity = state.opacity * (0.4 + 0.6 * lit);
        s.mesh.visible = state.opacity > 0.02;
      });
    };
  };

  /** CI/CD: repository -> nastro -> runner; a valle due slot blu e verde che si scambiano. */
  const cicd = (g: Group, a: Color): Update => {
    const n = figures.repositories;
    const repoGeo = cube(0.7, 0.7, 0.7);
    const repoMat = mat(a, 0.4);
    const edgeMat = wire(c.text);
    const sources = Array.from({ length: n }, (_, i) => {
      const at = new Vector3(-3.4, 0.35, (i - (n - 1) / 2) * 1.1);
      put(g, repoGeo, repoMat, at.x, at.y, at.z);
      frame(g, repoGeo, edgeMat, at.x, at.y, at.z);
      return at;
    });
    const merge = new Vector3(-2.3, 0.35, 0);
    const entry = new Vector3(0.7, 0.35, 0);
    segments(
      g,
      sources.flatMap((p) => [p, merge]),
      wire(a),
    );
    put(g, cube(3.4, 0.1, 0.5), mat(c.wall), (merge.x + entry.x) / 2, 0.05, 0);
    const itemMat = mat(c.text, 0.5);
    const items = sources.map(() => put(g, cube(0.28, 0.28, 0.28), itemMat));
    // Runner self-hosted: corpo, cabina e ingranaggio che gira.
    put(g, cube(1.4, 0.9, 1.2), mat(c.wall), 1.4, 0.45, 0);
    put(g, cube(0.8, 0.5, 0.8), mat(a, 0.6), 1.4, 1.15, 0);
    const gear = put(
      g,
      own(new CylinderGeometry(0.34, 0.34, 0.14, 8)),
      mat(c.text, 0.4),
      1.4,
      1.55,
    );
    // Blue-green: due slot, il traffico passa da uno all'altro.
    const out = new Vector3(2.1, 0.9, 0);
    const lanes = [c.blue, c.green].map((color, s) => {
      const z = s ? 1.2 : -1.2;
      const slot = mat(color);
      put(g, cube(1.3, 0.3, 1.4), slot, 3.5, 0.15, z);
      put(g, cube(0.7, 0.5, 0.7), slot, 3.5, 0.55, z);
      const to = new Vector3(3.5, 0.95, z);
      const dotMat = flat(color, true);
      return { slot, to, dotMat, dots: [0, 1, 2].map(() => put(g, spark, dotMat)) };
    });
    segments(
      g,
      lanes.flatMap((l) => [out, l.to]),
      wire(c.mute),
    );
    return (lit, t) => {
      items.forEach((item, i) => {
        const p = (t * 0.25 + i / n) % 1;
        const from = sources[i] as Vector3;
        if (p < 0.4) item.position.lerpVectors(from, merge, p / 0.4);
        else item.position.lerpVectors(merge, entry, (p - 0.4) / 0.6);
      });
      gear.rotation.y = t * 1.5;
      const green = smooth(0.5 + Math.sin(t * 0.9) * 0.9);
      lanes.forEach((lane, s) => {
        const w = s ? green : 1 - green;
        lane.slot.emissiveIntensity = lit * (0.15 + 0.85 * w);
        lane.dotMat.opacity = w;
        lane.dots.forEach((dot, j) => {
          dot.position.lerpVectors(out, lane.to, (t * 0.6 + j / 3) % 1);
          dot.visible = w > 0.05 && lit > 0.3;
        });
      });
    };
  };

  /** Osservabilita: pannelli con grafici simulati, un task che si divide su tre provider. */
  const observability = (g: Group, a: Color): Update => {
    const panelGeo = cube(2.3, 1.5, 0.08);
    const ink = wire(a);
    const trace = (parent: Object3D, values: number[], material: LineBasicMaterial): void => {
      const last = values.length - 1;
      parent.add(
        new Line(
          own(
            new BufferGeometry().setFromPoints(
              values.map((v, i) => new Vector3(-0.95 + (1.9 * i) / last, -0.55 + v * 0.9, 0.06)),
            ),
          ),
          material,
        ),
      );
    };
    const cursors = [0, 1, 2].map((p) => {
      const panel = new Group();
      panel.position.set(-2.7 + 2.7 * p, 1, -2.2);
      panel.rotation.x = -0.22;
      put(panel, panelGeo, mat(c.wall));
      frame(panel, panelGeo, ink);
      if (p === 1) {
        const bars = own(new InstancedMesh(cube(1, 1, 1), mat(a, 0.6), 12));
        series(5, 12).forEach((v, i) => {
          matrix
            .makeScale(0.1, v * 0.9, 0.05)
            .setPosition(-0.95 + i * 0.172, -0.55 + (v * 0.9) / 2, 0.06);
          bars.setMatrixAt(i, matrix);
        });
        panel.add(bars);
      } else {
        trace(panel, series(p + 1, 24), ink);
        if (p === 2) trace(panel, series(4, 24), wire(c.text));
      }
      const cursor = put(panel, cube(0.03, 1, 0.02), flat(c.text), 0, 0, 0.07);
      g.add(panel);
      return cursor;
    });
    // Task -> tre fasci verso tre provider (forme generiche) -> tre barre per provider.
    const task = new Vector3(-3.2, 0.6, 1.2);
    put(g, own(new IcosahedronGeometry(0.45, 1)), mat(c.text, 0.4), task.x, task.y, task.z);
    const shapes = [
      cube(0.8, 0.8, 0.8),
      own(new OctahedronGeometry(0.55)),
      own(new DodecahedronGeometry(0.5)),
    ];
    const providerMat = mat(a, 0.5);
    const beamMat = wire(a);
    const metrics = [mat(c.green, 0.6), mat(c.yellow, 0.6), mat(c.sky, 0.6)];
    const bar = cube(0.24, 1, 0.24);
    const dotMat = flat(c.text);
    const lanes = Array.from({ length: figures.providers }, (_, i) => {
      const z = -0.1 + i * 1.4;
      const at = new Vector3(0.3, 0.5, z);
      put(g, shapes[i % shapes.length] as BufferGeometry, providerMat, at.x, at.y, at.z);
      segments(g, [task, at], beamMat);
      const heights = series(7 + i, 3).map((v) => 0.3 + v);
      const bars = heights.map((h, j) => ({
        h,
        mesh: put(g, bar, metrics[j] as MeshStandardMaterial, 2 + j * 0.35, 0, z),
      }));
      return { at, bars, dot: put(g, spark, dotMat) };
    });
    return (lit, t) => {
      cursors.forEach((cursor, p) => {
        cursor.position.x = mix(-0.95, 0.95, (t * 0.18 + p / 3) % 1);
      });
      const cycle = (t * 0.22) % 1;
      const out = full ? cycle : 0.3;
      const grow = full ? smooth((cycle - 0.5) / 0.4) : 1;
      for (const lane of lanes) {
        lane.dot.position.lerpVectors(task, lane.at, Math.min(1, out * 2));
        lane.dot.visible = out < 0.5 && lit > 0.3;
        for (const b of lane.bars) {
          b.mesh.scale.y = Math.max(0.001, b.h * grow);
          b.mesh.position.y = b.mesh.scale.y / 2;
        }
      }
    };
  };

  /** Qualita: catena di scoring a stadi e griglia di spunte che diventano verdi. */
  const quality = (g: Group, a: Color): Update => {
    const shapes: BufferGeometry[] = [
      cube(0.9, 0.9, 0.9),
      own(new CylinderGeometry(0.5, 0.5, 0.5, 8)),
      cube(0.9, 0.9, 0.9),
      own(new OctahedronGeometry(0.6)),
      cube(0.9, 0.9, 0.9),
    ];
    const link = mat(c.wall);
    const stages = shapes.map((geo, i) => {
      const m = mat(a, 0.5);
      const mesh = put(g, geo, m, -3.2 + i * 1.6, 0.45, -2.1);
      if (i) put(g, cube(0.7, 0.1, 0.1), link, -4 + i * 1.6, 0.45, -2.1);
      return { m, mesh, x: mesh.position.x };
    });
    const token = put(g, spark, flat(c.text));
    // Le spunte: un'istanza per test, verdi in ordine pseudo-casuale con l'avanzamento.
    const n = figures.tests;
    const { cols, rows } = gridOf(n);
    // Bianco neutro: il colore vero di ogni spunta arriva dai token, istanza per istanza.
    const tileMat = own(new MeshBasicMaterial({ color: 0xffffff }));
    const tiles = own(new InstancedMesh(cube(0.16, 0.05, 0.16), tileMat, n));
    for (let i = 0; i < n; i += 1) {
      matrix.makeTranslation(
        ((i % cols) - (cols - 1) / 2) * 0.2,
        0.03,
        1.9 + (Math.floor(i / cols) - (rows - 1) / 2) * 0.2,
      );
      tiles.setMatrixAt(i, matrix);
    }
    g.add(tiles);
    const rank = checkRank(n, 11);
    let shown = -1;
    let age = 0;
    let last = 0;
    return (lit, t) => {
      // Le spunte partono quando la stazione si accende e si azzerano quando si spegne.
      age = lit > 0.5 ? age + Math.max(0, t - last) : lit < 0.2 ? 0 : age;
      last = t;
      const count = greenCount(n, full ? age / 4 : lit > 0.5 ? 1 : 0.5);
      if (count !== shown) {
        shown = count;
        for (let i = 0; i < n; i += 1)
          tiles.setColorAt(i, (rank[i] as number) < count ? c.green : c.line);
        if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
      }
      tileMat.color.setScalar(0.45 + 0.55 * lit);
      const x = ((t * 0.25) % 1) * 7.4 - 3.7;
      token.position.set(x, 1.2, -2.1);
      stages.forEach((s) => {
        s.m.emissiveIntensity = lit * (0.15 + 0.85 * clamp01(1 - Math.abs(x - s.x) / 1.1));
      });
      (stages[1] as { mesh: Mesh }).mesh.rotation.y = t;
    };
  };

  const builders = [infra, backup, cicd, observability, quality];
  const stations = STATIONS.map(({ x, z }, i) => {
    parts = [];
    const group = new Group();
    group.position.set(x, 0, z);
    root.add(group);
    const accent = accents[i] as Color;
    const pad = cube(PAD.width, 0.14, PAD.depth);
    put(group, pad, mat(c.wall), 0, 0.07, 0);
    frame(group, pad, wire(accent), 0, 0.07, 0);
    const content = new Group();
    content.position.y = 0.14;
    group.add(content);
    const update = (builders[i] as (g: Group, a: Color) => Update)(content, accent);
    return { parts, update };
  });

  const ambient = new AmbientLight(c.text, 0.9);
  const sun = new DirectionalLight(c.text, 1.4);
  sun.position.set(-3, 7, 4);
  scene.add(ambient, sun);

  // --- Stato ------------------------------------------------------------------------------------
  let userYaw: number | null = null;
  let elapsed = full ? 0 : STATIC_AT;
  let storyTarget = 0;
  let story = 0;
  let interactive = true;
  let baseDistance = 40;
  let size = { width: 1, height: 1 };
  const eye = new Vector3();
  const focuses = (moments.length > 0 ? moments : ['overview']).map(stationOf);

  /** Inquadratura del momento `index` (-1 = panoramica). */
  const pose = (index: number): Pose => {
    const s = focuses[index] ?? -1;
    const portrait = size.width < size.height;
    const lit = STATIONS.map((_, k) => (s < 0 ? LIT.overview : k === s ? LIT.on : LIT.off));
    if (s < 0)
      return {
        target: MAP_CENTER.clone(),
        yaw: userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude,
        elevation: 0.95,
        distance: 1,
        lift: 0.2,
        lit,
      };
    const at = STATIONS[s] as { x: number; z: number };
    return {
      target: new Vector3(at.x, 0.7, at.z),
      yaw: s % 2 ? -0.32 : 0.32,
      elevation: 0.78,
      distance: portrait ? PORTRAIT_ZOOM : STATION_ZOOM,
      lift: portrait ? PORTRAIT_LIFT : STATION_LIFT,
      lit,
    };
  };

  const place = (): void => {
    const { from, to, t } = blendAt(story, focuses.length);
    const a = pose(from);
    const b = pose(to);
    const target = a.target.lerp(b.target, t);
    const yaw = mix(a.yaw, b.yaw, t);
    const elevation = mix(a.elevation, b.elevation, t);
    eye.set(
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    camera.position
      .copy(target)
      .addScaledVector(eye, mix(a.distance, b.distance, t) * baseDistance);
    camera.lookAt(target);
    // Schermo largo: soggetto a destra delle schede; stretto: soggetto nella parte alta.
    const wide = size.width >= size.height;
    camera.setViewOffset(
      size.width,
      size.height,
      wide ? -SHIFT * size.width * 0.5 : 0,
      wide ? 0 : mix(a.lift, b.lift, t) * size.height,
      size.width,
      size.height,
    );
    stations.forEach((station, i) => {
      const lit = mix(a.lit[i] as number, b.lit[i] as number, t);
      for (const p of station.parts) {
        p.m.color.lerpColors(c.dim, p.base, 0.35 + 0.65 * lit);
        if (p.k) (p.m as MeshStandardMaterial).emissiveIntensity = p.k * lit;
      }
      station.update(lit, elapsed);
    });
    ambient.intensity = 0.9;
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  let frameId = 0;
  let last = 0;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  const invalidate = (): void => {
    if (!frameId && !disposed) draw();
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    elapsed += dt;
    const gap = storyTarget - story;
    story = Math.abs(gap) < 0.001 ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw();
    frameId = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    last = 0;
  };

  // Orbit orizzontale, solo nella prima schermata.
  const detachOrbit = attachOrbit(canvas, {
    maxYaw: MAX_YAW,
    yaw: () => userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude,
    onYaw(value) {
      if (!interactive) return;
      userYaw = value;
      invalidate();
    },
    onClick: () => undefined,
  });

  const fitDistance = (aspect: number): void => {
    const portrait = aspect < 1;
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const span = portrait ? 22 : 25;
    baseDistance = (span * (portrait ? 0.5 : 0.56)) / Math.tan(Math.min(horizontal, vertical));
  };

  return {
    start() {
      if (disposed || frameId || !full) return;
      frameId = requestAnimationFrame(tick);
    },
    stop,
    setStory(position, active) {
      storyTarget = Math.max(0, position);
      interactive = active;
      // Statica: si salta al momento; animata: la camera rincorre.
      if (!full) story = storyTarget;
      invalidate();
    },
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      size = { width: w, height: h };
      camera.aspect = w / h;
      fitDistance(camera.aspect);
      camera.updateProjectionMatrix();
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      detachOrbit();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
