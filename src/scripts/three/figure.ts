import {
  BoxGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';

/*
 * Personaggio low-poly generico (avatar della home, poi giocatori della scena Sport). Solo
 * primitive con flatShading e solo three: niente token, niente DOM. I colori arrivano dal chiamante
 * (che li legge dai token del tema). Origine ai piedi, in piedi lungo +Y, fronte verso +Z, alto ~1,9.
 *
 * Uso:
 *   const figure = createFigure({ skin, shirt, trousers, accent });
 *   scene.add(figure.root);
 *   figure.joints.armR.rotation.z = -2.4;   // braccio destro alzato
 *   // ...e a fine vita: figure.dispose()
 *
 * Le articolazioni sono Group con il perno alla spalla / anca / collo, a riposo con rotazione zero
 * (braccia e gambe distese lungo -Y). Ruotare `rotation.z` apre il braccio di lato, `rotation.x` lo
 * porta avanti/indietro; `armR` e il braccio dal lato +X (a destra di chi guarda la figura); per la sua apertura
 * verso l'alto `rotation.z` e positivo, per `armL` negativo.
 */

export interface FigureColors {
  skin: ColorRepresentation;
  shirt: ColorRepresentation;
  trousers: ColorRepresentation;
  /** Dettaglio (scarpe, capelli): tipicamente l'accento della sezione. */
  accent: ColorRepresentation;
}
export interface FigureJoints {
  /** Il corpo intero sopra le anche (busto + testa + braccia). */
  torso: Group;
  neck: Group;
  armL: Group;
  armR: Group;
  /** Gomiti: ruotare `rotation.x` per piegare l'avambraccio. */
  elbowL: Group;
  elbowR: Group;
  legL: Group;
  legR: Group;
}

export interface Figure {
  root: Group;
  joints: FigureJoints;
  /** Libera geometrie e materiali creati dalla figura. */
  dispose(): void;
}

const HIP_Y = 0.9;
const SHOULDER_Y = 0.78;
const SHOULDER_X = 0.36;

export function createFigure(colors: FigureColors): Figure {
  const owned: { dispose(): void }[] = [];
  const geometry = <T extends BufferGeometry>(g: T): T => {
    owned.push(g);
    return g;
  };
  const material = (color: ColorRepresentation): Material => {
    const m = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
    owned.push(m);
    return m;
  };
  const skin = material(colors.skin);
  const shirt = material(colors.shirt);
  const trousers = material(colors.trousers);
  const accent = material(colors.accent);

  const mesh = (g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => {
    const part = new Mesh(g, m);
    part.position.set(x, y, z);
    return part;
  };

  const root = new Group();
  const hips = new Group();
  hips.position.y = HIP_Y;
  root.add(hips);

  // Busto: un parallelepipedo largo alle spalle, con le anche appena piu strette.
  const torso = new Group();
  hips.add(torso);
  torso.add(mesh(geometry(new BoxGeometry(0.62, 0.78, 0.34)), shirt, 0, 0.4, 0));
  hips.add(mesh(geometry(new BoxGeometry(0.5, 0.16, 0.32)), trousers, 0, 0.02, 0));

  // Collo e testa (icosaedro: sfaccettata); capelli come calotta d'accento.
  const neck = new Group();
  neck.position.y = 0.82;
  torso.add(neck);
  neck.add(mesh(geometry(new CylinderGeometry(0.07, 0.08, 0.1, 6)), skin, 0, 0.04, 0));
  const head = mesh(geometry(new IcosahedronGeometry(0.2, 1)), skin, 0, 0.27, 0);
  neck.add(head);
  neck.add(mesh(geometry(new IcosahedronGeometry(0.21, 0)), accent, 0, 0.33, -0.05));
  // Naso e occhi: rendono leggibile da che parte guarda la figura (+Z).
  neck.add(mesh(geometry(new BoxGeometry(0.05, 0.07, 0.07)), skin, 0, 0.26, 0.2));
  const eyeGeometry = geometry(new BoxGeometry(0.04, 0.04, 0.02));
  neck.add(mesh(eyeGeometry, trousers, -0.08, 0.31, 0.185));
  neck.add(mesh(eyeGeometry, trousers, 0.08, 0.31, 0.185));

  // Braccio: spalla -> avambraccio con gomito; la mano e una sfera piccola.
  const arm = (side: 1 | -1) => {
    const shoulder = new Group();
    shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    const upperGeometry = geometry(new BoxGeometry(0.14, 0.34, 0.14));
    shoulder.add(mesh(upperGeometry, shirt, 0, -0.17, 0));
    const elbow = new Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    elbow.add(mesh(geometry(new BoxGeometry(0.12, 0.3, 0.12)), skin, 0, -0.15, 0));
    elbow.add(mesh(geometry(new IcosahedronGeometry(0.07, 0)), skin, 0, -0.33, 0));
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const right = arm(1);
  const left = arm(-1);

  // Gamba: anca -> piede (scarpa d'accento).
  const leg = (side: 1 | -1) => {
    const hip = new Group();
    hip.position.set(side * 0.14, 0, 0);
    hip.add(mesh(geometry(new BoxGeometry(0.17, 0.82, 0.18)), trousers, 0, -0.41, 0));
    hip.add(mesh(geometry(new BoxGeometry(0.19, 0.08, 0.3)), accent, 0, -0.86, 0.05));
    hips.add(hip);
    return hip;
  };
  const legR = leg(1);
  const legL = leg(-1);

  return {
    root,
    joints: {
      torso,
      neck,
      armR: right.shoulder,
      armL: left.shoulder,
      elbowR: right.elbow,
      elbowL: left.elbow,
      legR,
      legL,
    },
    dispose() {
      for (const resource of owned) resource.dispose();
    },
  };
}
