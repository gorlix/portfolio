import {
  type BufferGeometry,
  Color,
  type ColorRepresentation,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';

/*
 * Pinguino low-poly generico (personaggio delle micro-scene Sport e della scena Lavori). Solo
 * primitive con flatShading e solo three: niente token, niente DOM. I colori arrivano dal chiamante.
 * Origine tra i piedi, in piedi lungo +Y, fronte verso +Z, alto ~1,0. Le pose sono funzioni pure di
 * (posa, fase): nessun tempo, nessun caso. `root.position` e del chiamante: il rimbalzo va su un
 * gruppo interno.
 */

export interface PenguinColors {
  /** Corpo a uovo, dorso, testa. */
  body: ColorRepresentation;
  /** Pancia e viso (anche il bianco degli occhi). */
  belly: ColorRepresentation;
  /** Becco e piedi. */
  beak: ColorRepresentation;
  /** Pupille. */
  eye: ColorRepresentation;
}
export type PenguinPose = 'stand' | 'run' | 'jump' | 'ride' | 'wave' | 'ski' | 'bagher';
export interface PenguinJoints {
  body: Group;
  head: Group;
  flipperL: Group;
  flipperR: Group;
  footL: Group;
  footR: Group;
}
export interface Penguin {
  root: Group;
  joints: PenguinJoints;
  /** Due sci piatti sotto i piedi, visibili solo nella posa 'ski'. */
  skis: Group;
  /**
   * Azzera ogni articolazione, poi applica `pose`. Significato di `phase`:
   * run/ride/wave: ciclo (periodo 1); jump: 0..1 lungo l'arco; ski: inclinazione -1..1 (curva);
   * bagher: 0..1 intensita; stand: ignorata.
   */
  setPose(pose: PenguinPose, phase?: number): void;
  dispose(): void;
}

const TAU = Math.PI * 2;
const BODY_Y = 0.4;
const HEAD_Y = 0.4; // rispetto al corpo
const FOOT_Y = 0.05;

export function createPenguin(colors: PenguinColors): Penguin {
  const owned: { dispose(): void }[] = [];
  const geo = <T extends BufferGeometry>(g: T, sx = 1, sy = 1, sz = 1, dy = 0): T => {
    g.scale(sx, sy, sz);
    g.translate(0, dy, 0);
    owned.push(g);
    return g;
  };
  const mat = (color: ColorRepresentation): Material => {
    const m = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
    owned.push(m);
    return m;
  };
  const dark = mat(colors.body);
  const light = mat(colors.belly);
  const peach = mat(colors.beak);
  const pupil = mat(colors.eye);
  // Le pinne sono un poco piu scure del corpo: restano leggibili anche di profilo.
  const fin = mat(new Color(colors.body).lerp(new Color(colors.eye), 0.3));
  const mesh = (g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => {
    const part = new Mesh(g, m);
    part.position.set(x, y, z);
    return part;
  };
  const group = (parent: Group, x = 0, y = 0, z = 0): Group => {
    const g = new Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new Group();
  const inner = group(root);

  // Corpo a uovo (pivot a meta), pancia chiara davanti.
  const body = group(inner, 0, BODY_Y);
  body.add(mesh(geo(new IcosahedronGeometry(0.36, 1), 1, 1.2, 0.95), dark));
  body.add(mesh(geo(new IcosahedronGeometry(0.3, 1), 0.85, 1.1, 0.5), light, 0, -0.02, 0.2));

  // Testa con maschera chiara, occhi (bianco + pupilla) e becco.
  const head = group(body, 0, HEAD_Y);
  head.add(mesh(geo(new IcosahedronGeometry(0.2, 1)), dark));
  head.add(mesh(geo(new IcosahedronGeometry(0.15, 0), 1, 0.85, 0.55), light, 0, -0.03, 0.11));
  const white = geo(new IcosahedronGeometry(0.06, 0));
  const dot = geo(new IcosahedronGeometry(0.034, 0));
  for (const s of [-1, 1]) {
    head.add(mesh(white, light, s * 0.09, 0.05, 0.15));
    head.add(mesh(dot, pupil, s * 0.095, 0.05, 0.19));
  }
  head.add(mesh(geo(new ConeGeometry(0.06, 0.15, 4).rotateX(Math.PI / 2)), peach, 0, -0.02, 0.24));

  // Pinne: perno alla spalla, pendono lungo -Y. Piedi: perno alla caviglia.
  const wing = geo(new IcosahedronGeometry(0.1, 0), 0.4, 3, 1.6, -0.15);
  const flipper = (s: number): Group => {
    const g = group(body, s * 0.33, 0.22);
    g.add(mesh(wing, fin));
    return g;
  };
  const flipperL = flipper(-1);
  const flipperR = flipper(1);
  const sole = geo(new IcosahedronGeometry(0.1, 0), 1.3, 0.4, 2, 0);
  const foot = (s: number): Group => {
    const g = group(inner, s * 0.14, FOOT_Y);
    g.add(mesh(sole, peach, 0, 0, 0.06));
    return g;
  };
  const footL = foot(-1);
  const footR = foot(1);

  const skis = group(inner);
  skis.visible = false;
  const ski = geo(new IcosahedronGeometry(0.1, 0), 0.7, 0.3, 3.5);
  for (const s of [-1, 1]) skis.add(mesh(ski, dark, s * 0.14, 0.005, 0.12));

  const joints: PenguinJoints = { body, head, flipperL, flipperR, footL, footR };

  function setPose(pose: PenguinPose, p = 0): void {
    inner.position.set(0, 0, 0);
    body.position.set(0, BODY_Y, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    for (const j of [flipperL, flipperR]) j.rotation.set(0, 0, 0);
    footL.position.set(-0.14, FOOT_Y, 0);
    footR.position.set(0.14, FOOT_Y, 0);
    footL.rotation.set(0, 0, 0);
    footR.rotation.set(0, 0, 0);
    skis.visible = pose === 'ski';
    const s = Math.sin(p * TAU);
    const c = Math.cos(p * TAU);

    if (pose === 'run') {
      inner.position.y = 0.05 * Math.abs(s);
      body.rotation.set(0.12, 0, 0.14 * s);
      footL.position.z = 0.16 * s;
      footR.position.z = -0.16 * s;
      footL.position.y += 0.07 * Math.max(0, c);
      footR.position.y += 0.07 * Math.max(0, -c);
      flipperL.rotation.set(1.2 * s, 0, -0.9);
      flipperR.rotation.set(-1.2 * s, 0, 0.9);
    } else if (pose === 'jump') {
      const down = p < 0.15 ? 1 - p / 0.15 : p > 0.85 ? (p - 0.85) / 0.15 : 0;
      const air = 1 - down;
      body.scale.set(1 + 0.12 * down, 1 - 0.2 * down, 1 + 0.12 * down);
      body.position.y -= 0.08 * down;
      flipperL.rotation.z = -(0.4 + 1.7 * air);
      flipperR.rotation.z = 0.4 + 1.7 * air;
      for (const f of [footL, footR]) {
        f.position.y += 0.14 * air;
        f.rotation.x = -0.5 * air;
      }
    } else if (pose === 'ride') {
      body.rotation.set(-0.03, 0, 0.06 * s);
      flipperL.rotation.z = -(0.55 + 0.1 * c);
      flipperR.rotation.z = 0.55 + 0.1 * c;
      footL.position.z = 0.05;
      footR.position.z = -0.05;
    } else if (pose === 'wave') {
      flipperR.rotation.z = 2.5 + 0.3 * s;
      flipperL.rotation.z = -0.15;
      head.rotation.z = 0.08;
    } else if (pose === 'ski') {
      body.rotation.set(0.5, 0, 0.3 * p);
      body.position.y -= 0.1;
      head.rotation.x = -0.3;
      flipperL.rotation.set(0.9, 0, -0.3);
      flipperR.rotation.set(0.9, 0, 0.3);
    } else if (pose === 'bagher') {
      body.rotation.x = 0.4 * p;
      body.position.y -= 0.1 * p;
      head.rotation.x = -0.3 * p;
      flipperL.rotation.set(-0.9 * p, 0, 1.1 * p);
      flipperR.rotation.set(-0.9 * p, 0, -1.1 * p);
    }
  }
  setPose('stand');

  return {
    root,
    joints,
    skis,
    setPose,
    dispose() {
      for (const resource of owned) resource.dispose();
    },
  };
}
