import {
  BoxGeometry,
  type Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  RingGeometry,
  Shape,
  TubeGeometry,
  type Vector3,
} from 'three';

/*
 * Builder procedurali low-poly per la scena Homelab (piattaforme, rack, cavi, switch).
 * Tutto flat-shaded, nessun modello esterno. Ogni risorsa GPU passa da tools.own() e le parti
 * comuni (cubo unitario, materiali) si condividono tra istanze con una memo per ogni `tools`.
 */

export interface ModelTools {
  /** Registra geometrie/materiali da liberare in dispose. Ogni risorsa GPU creata DEVE passare da qui. */
  own<T extends { dispose(): void }>(resource: T): T;
}
export interface ModelColors {
  platform: Color;
  platformTop: Color;
  home: Color;
  production: Color;
  rack: Color;
  server: Color;
  selected: Color;
  led: Color;
  ledIdle: Color;
  danger: Color;
  cable: Color;
}
export interface RackView {
  group: Group;
  hit: Mesh;
  height: number;
  setSelected(on: boolean): void;
  setDown(on: boolean): void;
  setGlow(weight: number): void;
  blink(elapsed: number): void;
}

const RACK = { w: 0.55, h: 1, d: 0.55, post: 0.04, plate: 0.04 };
const caches = new WeakMap<ModelTools, Map<string, unknown>>();

function memo<T>(tools: ModelTools, key: string, make: () => T): T {
  const cache = caches.get(tools) ?? new Map<string, unknown>();
  caches.set(tools, cache);
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
const unitBox = (t: ModelTools) => memo(t, 'box', () => t.own(new BoxGeometry(1, 1, 1)));
const lit = (t: ModelTools, key: string, color: Color, roughness = 0.85) =>
  memo(t, `m:${key}`, () =>
    t.own(new MeshStandardMaterial({ color, flatShading: true, roughness })),
  );
const flat = (t: ModelTools, key: string, color: Color) =>
  memo(t, `b:${key}`, () => t.own(new MeshBasicMaterial({ color })));

type Vec3 = [number, number, number];

/** Parte scalata sul cubo unitario condiviso: dimensione e posizione del centro. */
function part(
  t: ModelTools,
  material: MeshStandardMaterial | MeshBasicMaterial,
  size: Vec3,
  at: Vec3,
): Mesh {
  const mesh = new Mesh(unitBox(t), material);
  mesh.scale.set(...size);
  mesh.position.set(...at);
  return mesh;
}

/** Esagono con i vertici sull'asse x (stessa orientazione per base, piano e anello). */
function hexagon(radius: number): Shape {
  const shape = new Shape();
  for (let k = 0; k < 6; k += 1) {
    const a = (k * Math.PI) / 3;
    const [x, y] = [Math.cos(a) * radius, Math.sin(a) * radius];
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

/** Prisma esagonale lungo y: parte da `y0`, alto `depth`, con smusso opzionale che resta nel raggio. */
function prism(radius: number, depth: number, y0: number, bevel = 0): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(hexagon(radius - bevel), {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry.translate(0, y0 + bevel, 0);
}

export function buildPlatform(
  tools: ModelTools,
  colors: ModelColors,
  kind: 'home' | 'production',
  radius: number,
  height: number,
): Group {
  const group = new Group();
  const cap = Math.min(0.03, height * 0.12);
  const base = new Mesh(
    tools.own(prism(radius, height - cap, -height / 2, 0.05)),
    lit(tools, 'platform', colors.platform, 0.9),
  );
  // Piano superiore rientrato, in un tono diverso.
  const top = new Mesh(
    tools.own(prism(radius * 0.9, cap, height / 2 - cap)),
    lit(tools, 'platformTop', colors.platformTop, 0.95),
  );
  group.add(base, top);

  // Anello luminoso del colore della regione sul piano, con una spia a ogni vertice.
  const ring = tools.own(new RingGeometry(radius * 0.93, radius * 0.97, 6));
  ring.rotateX(-Math.PI / 2);
  const glow = flat(tools, kind, colors[kind]);
  const band = new Mesh(ring, glow);
  band.position.y = height / 2 + 0.004;
  group.add(band);
  for (let k = 0; k < 6; k += 1) {
    const a = (k * Math.PI) / 3;
    const size = 0.08;
    const beacon = part(
      tools,
      glow,
      [size, size, size],
      [Math.cos(a) * radius * 0.95, height / 2 + size / 2, -Math.sin(a) * radius * 0.95],
    );
    beacon.rotation.y = a;
    group.add(beacon);
  }
  return group;
}

/** Hash deterministico 0..1: stesso seme, stesso lampeggio (niente Math.random). */
function hash(seed: number, i: number): number {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export function buildRack(
  tools: ModelTools,
  colors: ModelColors,
  options: { servers: number; seed: number },
): RackView {
  const { w, h, d, post, plate } = RACK;
  const group = new Group();
  // Telaio e server hanno materiale proprio per evidenziarli senza toccare gli altri rack.
  const frame = tools.own(
    new MeshStandardMaterial({ color: colors.rack, flatShading: true, roughness: 0.7 }),
  );
  const unit = tools.own(
    new MeshStandardMaterial({ color: colors.server, flatShading: true, roughness: 0.75 }),
  );
  const slot = lit(tools, 'rack', colors.rack, 0.7);

  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      group.add(
        part(tools, frame, [post, h, post], [(sx * (w - post)) / 2, h / 2, (sz * (d - post)) / 2]),
      );
  for (const y of [plate / 2, h - plate / 2])
    group.add(part(tools, frame, [w, plate, d], [0, y, 0]));

  // Unita 1U/2U alternate, impilate dal basso; l'altezza si scala per riempire il telaio.
  const units = Array.from({ length: Math.max(1, Math.round(options.servers)) }, (_, i) =>
    i % 2 ? 2 : 1,
  );
  const perU = (h - 2 * plate - 0.04) / units.reduce((a, b) => a + b, 0);
  const leds: { material: MeshBasicMaterial; phase: number; rate: number }[] = [];
  const front = d / 2 - post;
  let y = plate + 0.02;
  units.forEach((u, i) => {
    const uh = u * perU;
    group.add(part(tools, unit, [w - post * 2.4, uh - 0.012, d - post * 2], [0, y + uh / 2, 0]));
    // Griglia di ventilazione: scanalature sottili sul fronte.
    for (let s = 0; s < 3; s += 1)
      group.add(
        part(tools, slot, [0.18, 0.012, 0.012], [-0.08, y + uh * (0.25 + s * 0.25), front + 0.006]),
      );
    for (let k = 0; k < 2; k += 1) {
      const material = tools.own(new MeshBasicMaterial({ color: colors.led }));
      group.add(
        part(tools, material, [0.026, 0.026, 0.012], [0.14 + k * 0.05, y + uh / 2, front + 0.006]),
      );
      leds.push({
        material,
        phase: hash(options.seed, i * 2 + k),
        rate: 0.5 + hash(options.seed, i * 7 + k + 99) * 1.5,
      });
    }
    y += uh;
  });

  // Box invisibile per il raycast: copre tutto il rack.
  const hit = new Mesh(unitBox(tools), tools.own(new MeshBasicMaterial({ visible: false })));
  hit.scale.set(w, h, d);
  hit.position.y = h / 2;
  group.add(hit);

  let selected = false;
  let down = false;
  let glow = 0;
  const paint = (): void => {
    frame.color.copy(selected ? colors.selected : colors.rack);
    frame.emissive.copy(colors.selected);
    frame.emissiveIntensity = Math.max(selected ? 0.3 : 0, glow * 0.6);
    unit.color.copy(colors.server);
    if (down) unit.color.lerp(colors.rack, 0.6);
  };
  return {
    group,
    hit,
    height: h,
    setSelected(on) {
      selected = on;
      paint();
    },
    setDown(on) {
      down = on;
      paint();
    },
    setGlow(weight) {
      glow = Math.min(1, Math.max(0, weight));
      paint();
    },
    blink(elapsed) {
      for (const l of leds) {
        const on = (elapsed * l.rate + l.phase) % 1 < 0.55;
        l.material.color.copy(down ? colors.danger : on ? colors.led : colors.ledIdle);
      }
    },
  };
}

export function buildCable(
  tools: ModelTools,
  colors: ModelColors,
  from: Vector3,
  to: Vector3,
  sag = 0.25,
): Mesh {
  // Il punto di controllo sta al doppio dell'abbassamento: la curva scende di `sag` a meta.
  const control = from.clone().lerp(to, 0.5);
  control.y -= sag * 2;
  const curve = new QuadraticBezierCurve3(from.clone(), control, to.clone());
  return new Mesh(
    tools.own(new TubeGeometry(curve, 16, 0.015, 4, false)),
    lit(tools, 'cable', colors.cable, 0.8),
  );
}

export function buildSwitch(tools: ModelTools, colors: ModelColors): Group {
  const group = new Group();
  const [w, h, d] = [0.5, 0.08, 0.26];
  group.add(part(tools, lit(tools, 'server', colors.server, 0.75), [w, h, d], [0, h / 2, 0]));
  const port = lit(tools, 'rack', colors.rack, 0.7);
  const led = flat(tools, 'led', colors.led);
  for (let k = 0; k < 6; k += 1) {
    const x = (k - 2.5) * 0.075;
    group.add(part(tools, port, [0.05, 0.036, 0.012], [x, h * 0.4, d / 2 + 0.004]));
    group.add(part(tools, led, [0.016, 0.014, 0.012], [x, h * 0.82, d / 2 + 0.004]));
  }
  return group;
}
