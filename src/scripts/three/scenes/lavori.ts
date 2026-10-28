import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { WorkTree } from '../../../lib/work';
import { pixelRatioFor } from '../capabilities';
import {
  cardFraming,
  fitDistance,
  LEAF_LENGTH,
  layoutTree,
  leafIndex,
  type Side,
  trunkOffset,
} from '../lavori/tree';
import { attachOrbit } from '../orbit';
import { blendAt } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Lavori (spec §13), immersiva (PORT-81): un albero low-poly. Il tronco e la linea del
 * tempo, i rami spuntano alternati a destra e a sinistra e portano una foglia per esperienza
 * (la piu vecchia in basso). Nella prima schermata si vede l'albero intero; ogni scheda e una
 * foglia: la camera sale lungo il tronco, la foglia si accende e le altre restano attenuate.
 * Le foglie di volontariato hanno un altro colore, quella in corso un anello, quelle con
 * approfondimento un bocciolo. Solo forme generiche, tutto procedurale, colori dai token.
 * Senza racconto (nessun `setStory`) resta ferma sulla prima schermata.
 */

const MAX_YAW = 0.7;
/** Ondeggio delle foglie (solo livello 'full'): ampiezza in radianti e velocita. */
const SWAY = { amplitude: 0.07, speed: 0.9 };
/** Rincorsa della camera verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 5;
/** Secondi della salita lenta d'apertura nella prima schermata. */
const INTRO_SECONDS = 7;
/** Luce delle foglie: tutte a meta nella vista d'insieme, solo l'attiva su una scheda. */
const LIT = { overview: 0.62, active: 1, dimmed: 0.1 };

interface Pose {
  target: Vector3;
  yaw: number;
  elevation: number;
  distance: number;
  shift: number;
  lift: number;
  /** Per foglia (ordine cronologico): luce 0..1. */
  lit: number[];
}
type Weight = Exclude<keyof Pose, 'target' | 'lit'>;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const tree = data as WorkTree | undefined;
  const leaves = tree?.leaves ?? [];
  if (leaves.length === 0) throw new Error('lavori: dati della scena assenti');

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 120);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const surface = tint(['--surface', '--bg-alt']);
  const colors = {
    wood: tint(['--surface-hi', '--surface'])
      .lerp(tint(['--sec-domotica-alt', '--sec-lavori', '--text']), 0.3)
      .lerp(tint(['--text']), 0.12),
    ground: surface.clone().lerp(tint(['--bg-alt', '--surface']), 0.5),
    work: tint(['--sec-lavori', '--text']),
    volunteer: tint(['--sec-beneficenza', '--sec-lavori', '--text']),
    light: tint(['--text']),
  };

  const layout = layoutTree(leaves.map((l) => l.side as Side));
  const { height } = layout;

  const root = new Group();
  scene.add(root);

  // Legno: superficie chiara con un tocco caldo e un po' di testo, per staccarsi dallo sfondo.
  const woodMaterial = own(
    new MeshStandardMaterial({ color: colors.wood, flatShading: true, roughness: 0.9 }),
  );
  const up = new Vector3(0, 1, 0);
  const direction = new Vector3();
  /** Tratto di legno rastremato da `from` a `to` (raggi in basso e in alto). */
  const segment = (from: Vector3, to: Vector3, bottom: number, top: number, sides = 6): Mesh => {
    const geometry = own(new CylinderGeometry(top, bottom, 1, sides, 1).translate(0, 0.5, 0));
    const mesh = new Mesh(geometry, woodMaterial);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(up, direction.subVectors(to, from).normalize());
    mesh.scale.set(1, from.distanceTo(to), 1);
    root.add(mesh);
    return mesh;
  };

  // Tronco: catena di tratti che si assottigliano verso l'alto, con una lieve curva.
  const TRUNK = { bottom: 0.27, top: 0.07 };
  const pieces = Math.max(4, Math.round(height / 0.9));
  const trunkAt = (k: number): Vector3 => {
    const y = (height * k) / pieces;
    return new Vector3(trunkOffset(y), y, trunkOffset(y * 1.3 + 2) * 0.6);
  };
  for (let k = 0; k < pieces; k += 1) {
    const r = (f: number) => mix(TRUNK.bottom, TRUNK.top, f);
    segment(trunkAt(k), trunkAt(k + 1), r(k / pieces), r((k + 1) / pieces), 7);
  }
  // Radici: quattro contrafforti che escono dal piede e scendono nel terreno.
  for (let k = 0; k < 5; k += 1) {
    const angle = (k / 5) * Math.PI * 2 + 0.4;
    const out = new Vector3(Math.cos(angle) * 0.62, -0.02, Math.sin(angle) * 0.62);
    segment(new Vector3(Math.cos(angle) * 0.08, 0.4, Math.sin(angle) * 0.08), out, 0.1, 0.03, 5);
  }

  // Foglia: mandorla bassa e piegata lungo la nervatura, due faccette per lato; si apre lungo +X.
  const leafGeometry = own(
    (() => {
      const steps = 6;
      const half = 0.31;
      const fold = 0.32;
      const positions: number[] = [];
      const row = (k: number) => {
        const t = k / steps;
        const w = Math.sin(Math.PI * t ** 0.78) ** 0.9 * half;
        return { x: t * LEAF_LENGTH, w };
      };
      for (let k = 0; k < steps; k += 1) {
        const a = row(k);
        const b = row(k + 1);
        // Nervatura (y = 0) e due bordi rialzati: ogni tratto ha due quadrilateri, uno per lato.
        const mA = [a.x, 0, 0];
        const mB = [b.x, 0, 0];
        for (const sign of [1, -1]) {
          const lA = [a.x, a.w * fold, sign * a.w];
          const lB = [b.x, b.w * fold, sign * b.w];
          positions.push(...mA, ...lA, ...lB, ...mA, ...lB, ...mB);
        }
      }
      return new BufferGeometry().setAttribute(
        'position',
        new BufferAttribute(new Float32Array(positions), 3),
      );
    })(),
  );
  leafGeometry.computeVertexNormals();
  const budGeometry = own(new IcosahedronGeometry(0.1, 0));
  const leafMaterial = (color: Color, emissive: Color) =>
    own(
      new MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0,
        flatShading: true,
        roughness: 0.8,
        side: DoubleSide,
      }),
    );
  // Foglie decorative (spente) lungo i rami e in cima: stesso materiale, nessun costo in piu.
  const filler = surface.clone().lerp(colors.work, 0.38);
  const fillerMaterial = leafMaterial(filler, filler);
  const tuft = (parent: Object3D, at: Vector3, yaw: number, tilt: number, scale: number): void => {
    const mesh = new Mesh(leafGeometry, fillerMaterial);
    mesh.position.copy(at);
    mesh.rotation.set(0.9, yaw, tilt);
    mesh.scale.setScalar(scale);
    parent.add(mesh);
  };
  const curve = new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3());

  interface LeafView {
    slug: string;
    pivot: Group;
    material: MeshStandardMaterial;
    dim: Color;
    bright: Color;
    halo: MeshBasicMaterial | null;
    phase: number;
  }
  const views: LeafView[] = leaves.map((leaf, i) => {
    const { base, tip, side } = layout.branches[i] as (typeof layout.branches)[number];
    const sign = side === 'right' ? 1 : -1;
    const from = new Vector3(base.x + trunkOffset(base.y), base.y, base.z);
    const to = new Vector3(tip.x + trunkOffset(base.y), tip.y, tip.z);
    // Ramo: esce quasi in orizzontale e si piega verso l'alto sotto la foglia.
    curve.v0.copy(from);
    curve.v1.set(mix(from.x, to.x, 0.75), mix(from.y, to.y, 0.1), mix(from.z, to.z, 0.5));
    curve.v2.copy(to);
    const points = [0, 1 / 3, 2 / 3, 1].map((t) => curve.getPoint(t));
    for (let k = 0; k < 3; k += 1) {
      const r = (f: number) => mix(0.085, 0.03, f);
      segment(points[k] as Vector3, points[k + 1] as Vector3, r(k / 3), r((k + 1) / 3), 5);
    }
    // Due foglioline spente sul ramo, una sopra e una sotto.
    tuft(root, curve.getPoint(0.45), sign > 0 ? 0.5 : Math.PI - 0.5, 0.7, 0.4);
    tuft(root, curve.getPoint(0.72), sign > 0 ? -0.6 : Math.PI + 0.6, 0.5, 0.34);

    const bright = (leaf.volunteer ? colors.volunteer : colors.work).clone();
    const dim = bright.clone().lerp(surface, 0.7);
    const material = leafMaterial(dim, bright);
    // La foglia ondeggia attorno all'attacco del ramo: il pivot sta sulla punta.
    const pivot = new Group();
    pivot.position.copy(to);
    const blade = new Group();
    blade.rotation.set(0.85, sign > 0 ? 0 : Math.PI, 0.3);
    const leafMesh = new Mesh(leafGeometry, material);
    blade.add(leafMesh);
    if (leaf.detail) {
      const bud = new Mesh(budGeometry, material);
      bud.position.set(0.05, 0.1, 0);
      blade.add(bud);
    }
    // In corso: alone morbido, una copia piu grande della foglia, additiva, che pulsa piano.
    let halo: MeshBasicMaterial | null = null;
    if (leaf.ongoing) {
      halo = own(
        new MeshBasicMaterial({
          color: bright,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      const glow = new Mesh(leafGeometry, halo);
      glow.position.set(-0.06, -0.03, 0);
      glow.scale.set(1.14, 1.1, 1.3);
      blade.add(glow);
    }
    pivot.add(blade);
    root.add(pivot);
    return { slug: leaf.slug, pivot, material, dim, bright, halo, phase: i * 1.7 };
  });
  const slugs = views.map((v) => v.slug);

  // Cima: ciuffo di gemme e foglioline giovani, spente. E il futuro della linea del tempo.
  const crown = new Group();
  crown.position.copy(trunkAt(pieces));
  [0.0, 1.3, 2.5, 3.7, 5.0].forEach((yaw, k) => {
    tuft(crown, new Vector3(0, 0.02 * k, 0), yaw, 0.95 - (k % 2) * 0.35, 0.46 - (k % 2) * 0.08);
  });
  tuft(crown, new Vector3(0, 0.05, 0), 0.8, 1.35, 0.3);
  const bud = new Mesh(budGeometry, fillerMaterial);
  bud.position.y = 0.12;
  bud.scale.setScalar(1.1);
  crown.add(bud);
  root.add(crown);

  // Terreno: un disco basso e discreto, qualche sasso e ciuffi d'erba.
  const ground = new Mesh(
    // Cilindro sottile invece di CircleGeometry: gia nel chunk di three, nessun peso in piu.
    own(new CylinderGeometry(2.7, 2.7, 0.02, 9, 1).translate(0, -0.01, 0)),
    own(new MeshStandardMaterial({ color: colors.ground, flatShading: true, roughness: 1 })),
  );
  ground.position.y = -0.03;
  root.add(ground);
  const rockGeometry = own(new IcosahedronGeometry(0.2, 0));
  for (const [x, z, s] of [
    [1.15, 0.7, 1],
    [-1.3, 0.35, 0.7],
    [0.6, -1.25, 0.55],
  ] as const) {
    const rock = new Mesh(rockGeometry, woodMaterial);
    rock.position.set(x, 0.04, z);
    rock.scale.set(s * 1.3, s * 0.6, s);
    root.add(rock);
  }
  for (const [x, z] of [
    [-0.9, -0.85],
    [1.5, -0.3],
    [-1.6, 0.95],
    [0.3, 1.45],
  ] as const) {
    for (let k = 0; k < 3; k += 1) {
      tuft(root, new Vector3(x + k * 0.07, 0, z + k * 0.04), k * 2.1, 1.2, 0.26);
    }
  }

  const ambient = new AmbientLight(colors.light, 0.85);
  const sun = new DirectionalLight(colors.light, 1.5);
  sun.position.set(-3, 8, 5);
  scene.add(ambient, sun);

  // --- Stato ------------------------------------------------------------------------------------
  let userYaw: number | null = null;
  let elapsed = 0;
  let storyTarget = 0;
  let story = 0;
  let interactive = true;
  let size = { width: 1, height: 1 };
  const eye = new Vector3();
  const names = moments.length > 0 ? moments : ['overview'];

  const leafPoint = (index: number): Vector3 => {
    // Tra il tronco e il centro della foglia: si vede il ramo che la porta.
    const { base, tip, side } = layout.branches[index] as (typeof layout.branches)[number];
    const reach = (side === 'right' ? 1 : -1) * LEAF_LENGTH * 0.5;
    return new Vector3(
      (base.x + tip.x + reach) / 2 + trunkOffset(base.y),
      (base.y + tip.y + 0.2) / 2,
      (base.z + tip.z) / 2,
    );
  };

  /** Inquadratura del momento `index`. */
  const pose = (index: number): Pose => {
    const leaf = leafIndex(names[index] ?? 'overview', slugs);
    const aspect = size.width / size.height;
    const portrait = aspect < 1;
    if (leaf < 0) {
      // Insieme: tutto l'albero. In apertura (livello 'full') la camera sale piano dal basso.
      const intro = tier === 'full' && names[index] === 'overview' && !userYawSet() ? introT() : 1;
      const target = new Vector3(0, height * mix(0.42, 0.5, intro), 0);
      return {
        target,
        yaw: userYaw ?? Math.sin(elapsed * 0.15) * 0.15,
        elevation: mix(0.02, 0.1, intro),
        distance: fitDistance(
          portrait ? height + 2.4 : height + 3.2,
          portrait ? 5.6 : 5.4,
          aspect,
          camera.fov,
        ),
        shift: 0,
        lift: portrait ? -0.03 : 0,
        lit: views.map(() => (names[index] === 'exit' ? LIT.overview + 0.1 : LIT.overview)),
      };
    }
    const branch = layout.branches[leaf] as (typeof layout.branches)[number];
    const frame = cardFraming(branch.side, size.width);
    const sign = branch.side === 'right' ? 1 : -1;
    return {
      target: leafPoint(leaf),
      yaw: -sign * 0.3,
      elevation: 0.14,
      distance: fitDistance(portrait ? 4.6 : 4.4, portrait ? 4.4 : 7, aspect, camera.fov),
      shift: frame.shift,
      lift: frame.lift,
      lit: views.map((_, i) => (i === leaf ? LIT.active : LIT.dimmed)),
    };
  };
  const userYawSet = (): boolean => userYaw !== null;
  const introT = (): number => {
    const x = Math.min(1, elapsed / INTRO_SECONDS);
    return x * x * (3 - 2 * x);
  };

  const place = (): void => {
    const { from, to, t } = blendAt(story, names.length);
    const a = pose(from);
    const b = pose(to);
    const at = (key: Weight) => mix(a[key], b[key], t);

    const target = a.target.lerp(b.target, t);
    const yaw = at('yaw');
    const elevation = at('elevation');
    eye.set(
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    camera.position.copy(target).addScaledVector(eye, at('distance'));
    camera.lookAt(target);
    // Schermo largo: albero spostato di lato, la foglia resta accanto alla scheda. Schermo
    // stretto: foglia nella parte alta, sopra la scheda.
    camera.setViewOffset(
      size.width,
      size.height,
      -at('shift') * size.width * 0.5,
      at('lift') * size.height,
      size.width,
      size.height,
    );

    views.forEach((view, i) => {
      const level = mix(a.lit[i] ?? 0, b.lit[i] ?? 0, t);
      view.material.color.lerpColors(view.dim, view.bright, level);
      view.material.emissiveIntensity = level * level * 0.32;
      // Ondeggio e pulsazione solo con l'animazione accesa: a 'reduced' elapsed resta 0.
      const wave = tier === 'full' ? Math.sin(elapsed * SWAY.speed + view.phase) : 0;
      view.pivot.rotation.z = wave * SWAY.amplitude;
      view.pivot.rotation.x = wave * SWAY.amplitude * 0.5;
      if (view.halo) {
        const pulse = tier === 'full' ? 0.75 + Math.sin(elapsed * 1.6 + view.phase) * 0.25 : 0.8;
        view.halo.opacity = (0.06 + level * 0.2) * pulse;
      }
    });
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  const invalidate = (): void => {
    if (!frame && !disposed) draw();
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    elapsed += dt;
    const gap = storyTarget - story;
    story = Math.abs(gap) < 0.001 ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw();
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  // Orbit orizzontale solo nella prima schermata; il click non fa nulla.
  const detachOrbit = attachOrbit(canvas, {
    maxYaw: MAX_YAW,
    yaw: () => userYaw ?? Math.sin(elapsed * 0.15) * 0.15,
    onYaw(value) {
      if (!interactive) return;
      userYaw = value;
      invalidate();
    },
    onClick() {},
  });

  return {
    start() {
      if (disposed || frame || tier !== 'full') return;
      frame = requestAnimationFrame(tick);
    },
    stop,
    setStory(position, active) {
      storyTarget = Math.max(0, position);
      interactive = active;
      // Statica: si salta al momento e si ridisegna una volta; animata: la camera rincorre.
      if (tier !== 'full') story = storyTarget;
      invalidate();
    },
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      size = { width: w, height: h };
      camera.aspect = w / h;
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
