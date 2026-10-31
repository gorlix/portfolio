import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  type ColorRepresentation,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Vector2,
} from 'three';

/*
 * Pinguino low-poly generico (personaggio delle scene Sport e Lavori). Solo
 * primitive con flatShading e solo three: niente token, niente DOM. I colori arrivano dal chiamante.
 * Origine tra i piedi, in piedi lungo +Y, fronte verso +Z, alto ~1,0. Le pose sono funzioni pure di
 * (posa, fase): nessun tempo, nessun caso. `root.position` e del chiamante: il rimbalzo va su un
 * gruppo interno.
 *
 * Corpo e testa sono un solo solido di rotazione a goccia; pancia e maschera del viso sono le sue
 * facce anteriori colorate (colori per faccia), non pezzi appoggiati davanti: nessun bordo staccato.
 */

export interface PenguinColors {
  /** Corpo a goccia, dorso, testa. */
  body: ColorRepresentation;
  /** Pancia e maschera del viso. */
  belly: ColorRepresentation;
  /** Becco e piedi. */
  beak: ColorRepresentation;
  /** Occhi. */
  eye: ColorRepresentation;
}
export type PenguinPose = 'stand' | 'run' | 'jump' | 'ride' | 'wave' | 'ski' | 'bagher' | 'sit';
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
   * bagher: 0..1 intensita; stand, sit: ignorata.
   */
  setPose(pose: PenguinPose, phase?: number): void;
  dispose(): void;
}

/** Lunghezza di un passo: la fase della camminata dipende dallo spazio, non dal tempo. */
export const STRIDE = 0.45;

const TAU = Math.PI * 2;
/** Perno del corpo (a meta altezza) e centro della testa, rispetto al corpo. */
const BODY_Y = 0.4;
const HEAD_Y = 0.45;
const FOOT_Y = 0.03;
/** Pinne a riposo: appena aperte, seguono il fianco senza entrarci. */
const FLIPPER_REST = 0.3;
/** Sagoma (raggio, quota) dal basso alla cima: pancia piena, collo appena accennato, testa tonda. */
const PROFILE: readonly [number, number][] = [
  [0, 0.04],
  [0.2, 0.05],
  [0.31, 0.14],
  [0.36, 0.3],
  [0.35, 0.45],
  [0.3, 0.6],
  [0.24, 0.71],
  [0.215, 0.78],
  [0.21, 0.86],
  [0.17, 0.95],
  [0.09, 1.0],
  [0, 1.02],
];
const SEGMENTS = 12;
const STEP = TAU / SEGMENTS;

/**
 * Lo spicchio `slice` (0 = quello centrato sul davanti) della fascia a quota media `y` e chiaro?
 * Tre spicchi davanti, dalla base del petto fino sotto la fronte: pancia e viso in un pezzo solo.
 */
const isFront = (slice: number, y: number): boolean =>
  Math.min(slice, SEGMENTS - slice) <= 1 && y > 0.1 && y < 0.94;

export function createPenguin(colors: PenguinColors): Penguin {
  const owned: { dispose(): void }[] = [];
  const geo = <T extends BufferGeometry>(g: T, sx = 1, sy = 1, sz = 1, dy = 0): T => {
    g.scale(sx, sy, sz);
    g.translate(0, dy, 0);
    owned.push(g);
    return g;
  };
  const mat = (color: ColorRepresentation, vertexColors = false): Material => {
    const m = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, vertexColors });
    owned.push(m);
    return m;
  };
  const dark = mat(colors.body);
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

  // Corpo e testa: un solo solido di rotazione, colorato faccia per faccia (dorso scuro, fronte chiaro).
  // Senza indici: ogni faccia ha i suoi tre vertici e quindi un colore suo, a spigolo netto.
  // Uno spicchio centrato sul davanti (+Z): pancia e viso simmetrici.
  const lathe = new LatheGeometry(
    PROFILE.map(([r, y]) => new Vector2(r, y)),
    SEGMENTS,
    -STEP / 2,
  );
  const solid = geo(lathe.toNonIndexed(), 1, 1, 1, -BODY_Y);
  lathe.dispose();
  const position = solid.getAttribute('position');
  const tint = new Float32Array(position.count * 3);
  const back = new Color(colors.body);
  const front = new Color(colors.belly);
  for (let v = 0; v < position.count; v += 3) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k += 1) {
      x += position.getX(v + k) / 3;
      y += position.getY(v + k) / 3 + BODY_Y / 3;
      z += position.getZ(v + k) / 3;
    }
    // Spicchio e fascia del quadrilatero, uguali per i suoi due triangoli: bordo pulito.
    const slice = (Math.round(Math.atan2(x, z) / STEP) + SEGMENTS) % SEGMENTS;
    const band = Math.max(
      1,
      PROFILE.findIndex(([, py]) => py > y),
    );
    const mid = ((PROFILE[band - 1]?.[1] ?? 0) + (PROFILE[band]?.[1] ?? 1)) / 2;
    const c = isFront(slice, mid) ? front : back;
    for (let k = 0; k < 3; k += 1) c.toArray(tint, (v + k) * 3);
  }
  solid.setAttribute('color', new BufferAttribute(tint, 3));
  const body = group(inner, 0, BODY_Y);
  body.add(mesh(solid, mat(0xffffff, true)));

  // Testa: solo occhi e becco, sul solido; perno al centro della testa, cosi ruotando restano sulla sfera.
  const head = group(body, 0, HEAD_Y);
  const dot = geo(new IcosahedronGeometry(0.036, 1));
  for (const s of [-1, 1]) {
    const angle = s * 0.38;
    head.add(mesh(dot, pupil, Math.sin(angle) * 0.18, 0.045, Math.cos(angle) * 0.18));
  }
  head.add(mesh(geo(new ConeGeometry(0.05, 0.13, 4).rotateX(Math.PI / 2)), peach, 0, -0.02, 0.245));

  // Pinne: perno alla spalla, pendono lungo -Y aderenti al fianco. Piedi: perno alla caviglia.
  const wing = geo(new IcosahedronGeometry(0.5, 1), 0.065, 0.36, 0.16, -0.3);
  const flipper = (s: number): Group => {
    const g = group(body, s * 0.3, 0.2);
    g.add(mesh(wing, fin));
    return g;
  };
  const flipperL = flipper(-1);
  const flipperR = flipper(1);
  const sole = geo(new IcosahedronGeometry(0.5, 1), 0.15, 0.05, 0.24);
  const foot = (s: number): Group => {
    const g = group(inner, s * 0.12, FOOT_Y);
    g.add(mesh(sole, peach, 0, 0, 0.12));
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
    flipperL.rotation.set(0, 0, -FLIPPER_REST);
    flipperR.rotation.set(0, 0, FLIPPER_REST);
    footL.position.set(-0.12, FOOT_Y, 0);
    footR.position.set(0.12, FOOT_Y, 0);
    footL.rotation.set(0, 0, 0);
    footR.rotation.set(0, 0, 0);
    skis.visible = pose === 'ski';
    const s = Math.sin(p * TAU);
    const c = Math.cos(p * TAU);

    if (pose === 'run') {
      // Camminata dondolante: il corpo oscilla da un piede all'altro, le pinne si aprono appena.
      inner.position.y = 0.03 * Math.abs(s);
      body.rotation.set(0.06, 0, 0.1 * s);
      footL.position.z = 0.1 * s;
      footR.position.z = -0.1 * s;
      footL.position.y += 0.04 * Math.max(0, c);
      footR.position.y += 0.04 * Math.max(0, -c);
      flipperL.rotation.z = -(FLIPPER_REST + 0.25 * Math.max(0, s));
      flipperR.rotation.z = FLIPPER_REST + 0.25 * Math.max(0, -s);
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
    } else if (pose === 'sit') {
      // Seduto a terra: corpo basso e un po' indietro, piedi in avanti, pinne a riposo.
      body.position.y -= 0.17;
      body.rotation.x = -0.14;
      head.rotation.x = 0.12;
      for (const f of [footL, footR]) {
        f.position.z = 0.26;
        f.rotation.x = -0.9;
      }
    } else if (pose === 'wave') {
      flipperR.rotation.z = 2.5 + 0.3 * s;
      flipperL.rotation.z = -0.15;
      head.rotation.z = 0.08;
    } else if (pose === 'ski') {
      body.rotation.set(0.5, 0, 0.3 * p);
      body.position.y -= 0.1;
      head.rotation.x = -0.3;
      flipperL.rotation.set(0.5, 0, -0.45);
      flipperR.rotation.set(0.5, 0, 0.45);
    } else if (pose === 'bagher') {
      body.rotation.x = 0.4 * p;
      body.position.y -= 0.1 * p;
      head.rotation.x = -0.3 * p;
      // Pinne avanti e verso il basso, quasi unite davanti alla pancia (senza entrarci).
      flipperL.rotation.set(-1.1 * p, 0, -FLIPPER_REST * (1 - p) + 0.3 * p);
      flipperR.rotation.set(-1.1 * p, 0, FLIPPER_REST * (1 - p) - 0.3 * p);
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
