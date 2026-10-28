import {
  AmbientLight,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { WorkTree } from '../../../lib/work';
import { pixelRatioFor } from '../capabilities';
import { cardFraming, fitDistance, layoutTree, leafIndex, type Side } from '../lavori/tree';
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
const LEAF_RADIUS = 0.46;

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
    trunk: tint(['--surface-hi', '--surface']).lerp(tint(['--border', '--surface-hi']), 0.35),
    ground: surface,
    work: tint(['--sec-lavori', '--text']),
    volunteer: tint(['--sec-beneficenza', '--sec-lavori', '--text']),
    ring: tint(['--text']),
    light: tint(['--text']),
  };

  const layout = layoutTree(leaves.map((l) => l.side as Side));
  const { height } = layout;

  const root = new Group();
  scene.add(root);

  // Tronco: un tronco di cono lungo tutta la linea del tempo, con un poco di base allargata.
  const trunkMaterial = own(
    new MeshStandardMaterial({ color: colors.trunk, flatShading: true, roughness: 0.95 }),
  );
  const trunkGeometry = own(new CylinderGeometry(0.1, 0.22, height, 7, 1));
  trunkGeometry.translate(0, height / 2, 0);
  root.add(new Mesh(trunkGeometry, trunkMaterial));
  // Cima: una piccola chioma spenta, cosi il tronco non finisce nel vuoto.
  const crownMaterial = own(
    new MeshStandardMaterial({ color: colors.trunk, flatShading: true, roughness: 0.95 }),
  );
  const crown = new Mesh(own(new IcosahedronGeometry(0.34, 0)), crownMaterial);
  crown.position.y = height + 0.1;
  root.add(crown);
  const groundGeometry = own(new CircleGeometry(2.4, 9).rotateX(-Math.PI / 2));
  const ground = new Mesh(
    groundGeometry,
    own(new MeshStandardMaterial({ color: colors.ground, flatShading: true, roughness: 1 })),
  );
  ground.position.y = -0.02;
  root.add(ground);

  // Ramo = cilindro unitario in verticale, ruotato e allungato dalla biforcazione alla punta.
  const branchGeometry = own(new CylinderGeometry(0.045, 0.075, 1, 5, 1).translate(0, 0.5, 0));
  const leafGeometry = own(new IcosahedronGeometry(LEAF_RADIUS, 0));
  const budGeometry = own(new IcosahedronGeometry(0.1, 0));
  const ringGeometry = own(new TorusGeometry(LEAF_RADIUS * 1.35, 0.025, 4, 18));
  const ringMaterial = own(
    new MeshStandardMaterial({ color: colors.ring, emissive: colors.ring, emissiveIntensity: 0.9 }),
  );

  interface LeafView {
    slug: string;
    pivot: Group;
    material: MeshStandardMaterial;
    dim: Color;
    bright: Color;
    ring: Mesh | null;
    phase: number;
  }
  const up = new Vector3(0, 1, 0);
  const views: LeafView[] = leaves.map((leaf, i) => {
    const { base, tip } = layout.branches[i] as (typeof layout.branches)[number];
    const from = new Vector3(base.x, base.y, base.z);
    const to = new Vector3(tip.x, tip.y, tip.z);
    const branch = new Mesh(branchGeometry, trunkMaterial);
    branch.position.copy(from);
    branch.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    branch.scale.set(1, from.distanceTo(to), 1);
    root.add(branch);

    const bright = (leaf.volunteer ? colors.volunteer : colors.work).clone();
    const dim = bright.clone().lerp(surface, 0.72);
    const material = own(
      new MeshStandardMaterial({
        color: dim,
        emissive: bright,
        emissiveIntensity: 0,
        flatShading: true,
        roughness: 0.8,
      }),
    );
    // La foglia ondeggia attorno al punto d'attacco del ramo: il pivot sta sulla punta.
    const pivot = new Group();
    pivot.position.copy(to);
    const blob = new Mesh(leafGeometry, material);
    blob.scale.set(1.15, 0.7, 0.9);
    pivot.add(blob);
    if (leaf.detail) {
      const bud = new Mesh(budGeometry, material);
      bud.position.set(0, LEAF_RADIUS * 0.85, 0);
      pivot.add(bud);
    }
    let ring: Mesh | null = null;
    if (leaf.ongoing) {
      ring = new Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1.15, 1.15, 1);
      pivot.add(ring);
    }
    root.add(pivot);
    return { slug: leaf.slug, pivot, material, dim, bright, ring, phase: i * 1.7 };
  });
  const slugs = views.map((v) => v.slug);

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
    const { base, tip } = layout.branches[index] as (typeof layout.branches)[number];
    return new Vector3((base.x + tip.x) / 2, (base.y + tip.y) / 2, (base.z + tip.z) / 2);
  };

  /** Inquadratura del momento `index`. */
  const pose = (index: number): Pose => {
    const leaf = leafIndex(names[index] ?? 'overview', slugs);
    const aspect = size.width / size.height;
    const portrait = aspect < 1;
    if (leaf < 0) {
      // Insieme: tutto l'albero. In apertura (livello 'full') la camera sale piano dal basso.
      const intro = tier === 'full' && names[index] === 'overview' && !userYawSet() ? introT() : 1;
      const target = new Vector3(0, height * mix(0.3, 0.46, intro), 0);
      return {
        target,
        yaw: userYaw ?? Math.sin(elapsed * 0.15) * 0.15,
        elevation: mix(-0.04, 0.12, intro),
        distance: fitDistance(height + 1.6, portrait ? 6.2 : 4.8, aspect, camera.fov),
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
      view.material.emissiveIntensity = level * level * 0.5;
      // Ondeggio e pulsazione solo con l'animazione accesa: a 'reduced' elapsed resta 0.
      const wave = tier === 'full' ? Math.sin(elapsed * SWAY.speed + view.phase) : 0;
      view.pivot.rotation.z = wave * SWAY.amplitude;
      view.pivot.rotation.x = wave * SWAY.amplitude * 0.5;
      if (view.ring) {
        const pulse = tier === 'full' ? 1 + Math.sin(elapsed * 2 + view.phase) * 0.08 : 1;
        view.ring.scale.set(1.15 * pulse, 1.15 * pulse, 1);
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
