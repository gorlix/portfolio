import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { DomoticaModel } from '../../../lib/domotica';
import { pixelRatioFor } from '../capabilities';
import { momentFocus } from '../domotica/moments';
import { createDomoticaSim, SIM_SEED, type Snapshot } from '../domotica/sim';
import { bindSimUi } from '../domotica/ui';
import { attachOrbit } from '../orbit';
import { bindPanelUi } from '../panel';
import { blendAt, ease } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Domotica (spec §12.2): casa low-poly vista dall'alto, senza tetto, con una stanza per voce
 * dei dati. Quando "parte" un'automazione la sua stanza si illumina; la scelta di una stanza
 * (dal canvas o dai pulsanti HTML, ../panel.ts) apre il pannello con trigger, condizioni e azioni.
 * Pianta generica, non la casa vera. Tutto procedurale, colori solo dai token del tema.
 *
 * Scena immersiva (PORT-80): nella prima schermata si usa (orbit orizzontale, scelta delle stanze,
 * dimostrazione a turno); scorrendo, ogni scheda e un momento (../domotica/moments.ts): clima per
 * stanza, una scheda per automazione (la camera va sulla sua stanza), audio multi-room con una
 * cassa per stanza, aria e stazione meteo sul tetto. I sensori sono simulati (../domotica/sim.ts)
 * e avanzano solo mentre la scena anima. Senza racconto (nessun `setStory`) resta ferma sulla
 * prima schermata, come una scena interattiva.
 */

const ROOM = 2.2;
const WALL = { height: 0.55, thickness: 0.08 };
const FLOOR_HEIGHT = 0.12;
const ROOF_Y = FLOOR_HEIGHT + WALL.height + 0.85;
const ROOF_HEIGHT = 1.1;
const APEX = ROOF_Y + ROOF_HEIGHT / 2;
const MAX_YAW = 0.6;
const SWAY = { amplitude: 0.18, speed: 0.15 };
/** Secondi tra un'automazione dimostrativa e la successiva, e durata del bagliore. */
const DEMO_EVERY = 3.5;
const GLOW_SECONDS = 2.2;
/** Rincorsa della camera verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 5;
/** Elevazione della vista d'insieme (radianti): la pianta si legge dall'alto. */
const OVERVIEW_ELEVATION = 0.86;
/** Schermo verticale: piu dall'alto, cosi la pianta riempie l'altezza invece di lasciare bande. */
const PORTRAIT_LIFT = 0.18;
/** Secondi reali tra un passo dei sensori simulati (15 minuti simulati) e il successivo. */
const SIM_EVERY = 1.2;
/** Onde sonore per cassa e loro periodo (s): partono insieme in tutte le stanze. */
const RINGS = 2;
const BEAT = 1.6;
const PULSES = 4;
/** Temperature (°C) agli estremi della scala di colore del pavimento. */
const COLD = 19.5;
const WARM = 22;

interface Pose {
  target: Vector3;
  yaw: number;
  elevation: number;
  /** Moltiplicatore della distanza d'insieme. */
  distance: number;
  /** Spostamento del soggetto nel riquadro (vedi `place`). */
  shift: number;
  /** Schermo stretto: frazione d'altezza di cui il soggetto sale (negativa = scende). */
  lift: number;
  /** Per stanza (ordine della pianta): luce della stanza e del suo dispositivo, 0..1. */
  lit: number[];
  device: number[];
  roof: number;
  /** Penombra sulle stanze spente, 0..1. */
  dim: number;
  /** Layer dei momenti a nome fisso, 0..1. */
  climate: number;
  audio: number;
  weather: number;
}
type Weight = Exclude<keyof Pose, 'target' | 'lit' | 'device'>;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const model = data as DomoticaModel | undefined;
  const rooms = model?.rooms.filter((r) => r.kind === 'room') ?? [];
  const house = model?.rooms.find((r) => r.kind === 'house');
  if (!model || rooms.length === 0) throw new Error('domotica: dati della scena assenti');

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 80);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const colors = {
    floor: tint(['--surface', '--bg-alt']),
    wall: tint(['--surface-hi', '--surface']),
    edge: tint(['--sec-domotica', '--text']),
    roof: tint(['--sec-domotica-alt', '--sec-domotica']),
    lampOff: tint(['--border', '--surface-hi']),
    lampOn: tint(['--ctp-yellow', '--text']),
    glow: tint(['--sec-domotica', '--text']),
    light: tint(['--text']),
    cold: tint(['--ctp-blue', '--text']),
    warm: tint(['--ctp-peach', '--text']),
    audio: tint(['--ctp-mauve', '--sec-domotica']),
    data: tint(['--ctp-teal', '--sec-domotica']),
  };

  // Pianta a griglia quasi quadrata, centrata sull'origine.
  const columns = Math.ceil(Math.sqrt(rooms.length));
  const rows = Math.ceil(rooms.length / columns);
  const width = columns * ROOM;
  const depth = rows * ROOM;

  const floorGeometry = own(
    new BoxGeometry(ROOM - WALL.thickness, FLOOR_HEIGHT, ROOM - WALL.thickness),
  );
  const wallGeometryX = own(new BoxGeometry(ROOM, WALL.height, WALL.thickness));
  const wallGeometryZ = own(new BoxGeometry(WALL.thickness, WALL.height, ROOM));
  const wallMaterial = own(new MeshStandardMaterial({ color: colors.wall, flatShading: true }));
  const poleGeometry = own(new CylinderGeometry(0.025, 0.025, 0.5, 6));
  const shadeGeometry = own(new IcosahedronGeometry(0.14, 0));
  const deviceGeometry = own(new BoxGeometry(0.36, 0.2, 0.26));
  const deviceEdges = own(new EdgesGeometry(deviceGeometry));
  const edgeMaterial = own(new LineBasicMaterial({ color: colors.edge }));
  const speakerGeometry = own(new CylinderGeometry(0.1, 0.13, 0.32, 8));
  const ringGeometry = own(new RingGeometry(0.92, 1, 28).rotateX(-Math.PI / 2));
  const dotGeometry = own(new SphereGeometry(0.05, 6, 4));
  const fade = (color: Color) =>
    own(new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
  // Un materiale per onda, condiviso da tutte le casse: la musica parte insieme ovunque.
  const ringMaterials = Array.from({ length: RINGS }, () => fade(colors.audio));
  const audioDots = fade(colors.audio);
  const dataDots = fade(colors.data);

  const root = new Group();
  scene.add(root);

  interface RoomView {
    id: string;
    centre: Vector3;
    floor: Mesh<BoxGeometry, MeshStandardMaterial>;
    lamp: MeshStandardMaterial;
    device: MeshStandardMaterial;
    speaker: MeshStandardMaterial;
    rings: Mesh[];
    /** Punto del dispositivo, da cui partono i dati verso la stazione meteo. */
    sensor: Vector3;
    speakerAt: Vector3;
    /** Secondi di bagliore rimasti (0 = spenta). */
    glow: number;
  }
  const glowing = (base: Color, emissive: Color) =>
    own(
      new MeshStandardMaterial({ color: base, emissive, emissiveIntensity: 0, flatShading: true }),
    );
  const views: RoomView[] = rooms.map((room, i) => {
    const x = (i % columns) * ROOM - width / 2 + ROOM / 2;
    const z = Math.floor(i / columns) * ROOM - depth / 2 + ROOM / 2;

    const floor = new Mesh(
      floorGeometry,
      own(new MeshStandardMaterial({ color: colors.floor, flatShading: true, roughness: 0.9 })),
    );
    floor.position.set(x, FLOOR_HEIGHT / 2, z);
    floor.userData.roomId = room.id;
    root.add(floor);

    // Muri bassi sui lati di ogni stanza: la casa si legge dall'alto come una pianta.
    for (const [geometry, dx, dz] of [
      [wallGeometryX, 0, -ROOM / 2],
      [wallGeometryX, 0, ROOM / 2],
      [wallGeometryZ, -ROOM / 2, 0],
      [wallGeometryZ, ROOM / 2, 0],
    ] as const) {
      const wall = new Mesh(geometry, wallMaterial);
      wall.position.set(x + dx, FLOOR_HEIGHT + WALL.height / 2, z + dz);
      root.add(wall);
    }

    const lamp = glowing(colors.lampOff, colors.lampOn);
    const pole = new Mesh(poleGeometry, wallMaterial);
    pole.position.set(x - ROOM * 0.28, FLOOR_HEIGHT + 0.25, z - ROOM * 0.28);
    const shade = new Mesh(shadeGeometry, lamp);
    shade.position.set(pole.position.x, FLOOR_HEIGHT + 0.56, pole.position.z);
    // Un dispositivo generico per stanza: sensore, hub o schermo, l'importante e che si accenda.
    const device = glowing(colors.wall, colors.glow);
    const box = new Mesh(deviceGeometry, device);
    box.position.set(x + ROOM * 0.22, FLOOR_HEIGHT + 0.1, z + ROOM * 0.2);
    box.add(new LineSegments(deviceEdges, edgeMaterial));
    // Una cassa per stanza (l'audio e in tutte), con le sue onde sul pavimento.
    const speaker = glowing(colors.wall, colors.audio);
    const cassa = new Mesh(speakerGeometry, speaker);
    cassa.position.set(x + ROOM * 0.28, FLOOR_HEIGHT + 0.16, z - ROOM * 0.28);
    const rings = ringMaterials.map((material) => {
      const ring = new Mesh(ringGeometry, material);
      ring.position.set(cassa.position.x, FLOOR_HEIGHT + 0.02, cassa.position.z);
      return ring;
    });
    root.add(pole, shade, box, cassa, ...rings);

    return {
      id: room.id,
      centre: new Vector3(x, FLOOR_HEIGHT, z),
      floor,
      lamp,
      device,
      speaker,
      rings,
      sensor: box.position.clone(),
      speakerAt: cassa.position.clone().setY(FLOOR_HEIGHT + 0.4),
      glow: 0,
    };
  });

  // Perimetro della casa intera: un tetto solo accennato, che si illumina per le automazioni globali.
  // Piramide a base quadrata unitaria (raggio 1/sqrt2 ruotato di 45 gradi), poi scalata sulla pianta.
  const roofGeometry = own(new ConeGeometry(Math.SQRT1_2, ROOF_HEIGHT, 4, 1, true));
  const roofMaterial = own(
    new LineBasicMaterial({ color: colors.roof, transparent: true, opacity: 0.35 }),
  );
  const pyramid = new LineSegments(own(new EdgesGeometry(roofGeometry)), roofMaterial);
  pyramid.rotation.y = Math.PI / 4;
  const roof = new Group();
  roof.add(pyramid);
  roof.scale.set(width + 0.2, 1, depth + 0.2);
  roof.position.y = ROOF_Y;
  root.add(roof);
  let houseGlow = 0;

  // Stazione meteo sul colmo del tetto: palo, sensori e anemometro che gira col vento simulato.
  const station = new Group();
  station.position.set(0, APEX, 0);
  const stationMaterial = glowing(colors.wall, colors.data);
  const mast = new Mesh(own(new CylinderGeometry(0.03, 0.03, 0.7, 6)), wallMaterial);
  mast.position.y = 0.35;
  const housing = new Mesh(own(new CylinderGeometry(0.12, 0.12, 0.2, 6)), stationMaterial);
  housing.position.y = 0.4;
  const anemometer = new Group();
  anemometer.position.y = 0.72;
  const armGeometry = own(new BoxGeometry(0.34, 0.015, 0.015));
  const cupGeometry = own(new SphereGeometry(0.045, 6, 4));
  for (let k = 0; k < 3; k += 1) {
    const arm = new Group();
    arm.rotation.y = (k * Math.PI * 2) / 3;
    const bar = new Mesh(armGeometry, wallMaterial);
    bar.position.x = 0.17;
    const cup = new Mesh(cupGeometry, stationMaterial);
    cup.position.x = 0.34;
    arm.add(bar, cup);
    anemometer.add(arm);
  }
  station.add(mast, housing, anemometer);
  root.add(station);
  const stationAt = new Vector3(0, APEX + 0.4, 0);

  // Audio multi-room: un anello che unisce le casse, con impulsi che lo percorrono.
  const loop = views.map((v) => v.speakerAt);
  const audioLine = own(
    new LineBasicMaterial({ color: colors.audio, transparent: true, opacity: 0 }),
  );
  root.add(
    new Line(own(new BufferGeometry().setFromPoints([...loop, loop[0] as Vector3])), audioLine),
  );
  const audioPulses = Array.from({ length: PULSES }, () => {
    const dot = new Mesh(dotGeometry, audioDots);
    root.add(dot);
    return dot;
  });
  // Dati: dai sensori delle stanze alla stazione sul tetto.
  const dataPulses = views.map(() => {
    const dot = new Mesh(dotGeometry, dataDots);
    root.add(dot);
    return dot;
  });

  const ambient = new AmbientLight(colors.light, 0.9);
  const sun = new DirectionalLight(colors.light, 1.4);
  sun.position.set(-3, 7, 4);
  scene.add(ambient, sun);

  // --- Sensori simulati ------------------------------------------------------------------------
  const sim = createDomoticaSim(
    rooms.map((r) => r.id),
    SIM_SEED,
  );
  let readings: Snapshot = sim.snapshot();
  const simUi = bindSimUi(container);

  // --- Stato ------------------------------------------------------------------------------------
  let selected: string | null = null;
  let userYaw: number | null = null;
  let elapsed = 0;
  let sinceSim = 0;
  let nextDemo = 1;
  const demoRooms = model.rooms.filter((r) => r.automations.length > 0).map((r) => r.id);
  let demoIndex = 0;
  let storyTarget = 0;
  let story = 0;
  let interactive = true;
  let baseDistance = 10;
  let size = { width: 1, height: 1 };
  const eye = new Vector3();
  const warmth = new Color();
  const focuses = (moments.length > 0 ? moments : ['overview']).map((name) =>
    momentFocus(name, model),
  );

  const fire = (id: string): void => {
    if (house && id === house.id) houseGlow = GLOW_SECONDS;
    const view = views.find((v) => v.id === id);
    if (view) view.glow = GLOW_SECONDS;
  };

  /** Inquadratura del momento `index`; `local` = distanza dal momento (-1..1). */
  const pose = (index: number, local: number): Pose => {
    const focus = focuses[index] ?? { kind: 'overview' };
    const portrait = size.width < size.height ? PORTRAIT_LIFT : 0;
    const off = views.map(() => 0);
    const card = {
      target: new Vector3(),
      yaw: 0,
      elevation: OVERVIEW_ELEVATION + portrait,
      distance: 1,
      shift: 0.2,
      // Sopra la scheda, che sta al centro dello schermo.
      lift: 0.24,
      lit: off,
      device: off,
      roof: 0,
      dim: 0.5,
      climate: 0,
      audio: 0,
      weather: 0,
    };
    switch (focus.kind) {
      case 'automations': {
        const centres = views.filter((v) => focus.rooms.includes(v.id)).map((v) => v.centre);
        const target = centres
          .reduce((sum, c) => sum.add(c), new Vector3())
          .divideScalar(Math.max(1, centres.length));
        const on = views.map((v) => (focus.rooms.includes(v.id) ? 1 : focus.house ? 0.5 : 0));
        // Il dispositivo si accende mentre la scheda arriva al centro: si vede l'azione partire.
        const device = ease((local + 0.45) / 0.5);
        return {
          ...card,
          target,
          // Schede alterne da lati opposti: la casa non sembra sempre la stessa foto.
          yaw: index % 2 ? 0.28 : -0.28,
          elevation: OVERVIEW_ELEVATION - 0.06 + portrait,
          distance: centres.length > 0 ? 0.42 + 0.18 * (centres.length - 1) : 1.1,
          lit: on,
          device: on.map((level) => level * device),
          roof: focus.house ? 1 : 0,
          dim: 1,
        };
      }
      case 'climate':
        // Quasi dall'alto: i pavimenti colorati dalla temperatura si leggono come una mappa.
        return { ...card, elevation: 1.25 + portrait * 0.5, distance: 0.95, dim: 0.3, climate: 1 };
      case 'audio':
        return { ...card, yaw: 0.3, elevation: 0.7 + portrait, distance: 0.92, audio: 1 };
      case 'weather':
        // Piu bassa e vicina al tetto: la stazione meteo in primo piano, la casa sotto.
        return {
          ...card,
          target: new Vector3(0, APEX * 0.7, 0),
          yaw: -0.25,
          elevation: 0.42 + portrait,
          distance: 0.8,
          roof: 0.6,
          weather: 1,
        };
      case 'projects':
        // Quasi in pianta, tutto spento: restano i contorni.
        return { ...card, elevation: 1.3, distance: 1.05, dim: 0.6 };
      default: {
        // Prima schermata: stanza scelta dall'utente, o bagliore della dimostrazione. A scena ferma
        // (reduced-motion, poster) la dimostrazione non gira: restano accese a meta le stanze
        // con automazioni, cosi il fotogramma non e una casa spenta.
        const houseOn = house !== undefined && selected === house.id;
        const idle = (id: string, glow: number) =>
          tier === 'full' ? Math.min(glow / GLOW_SECONDS, 1) : demoRooms.includes(id) ? 0.6 : 0;
        const lit = views.map((v) => (v.id === selected || houseOn ? 1 : idle(v.id, v.glow)));
        return {
          ...card,
          yaw: userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude,
          // Con il racconto i comandi stanno a destra: la casa si sposta a sinistra.
          shift: moments.length > 0 ? -0.12 : 0,
          // Telefono: un po' piu in basso, tra l'intro e la barra dei comandi.
          lift: -0.06,
          lit,
          device: lit,
          roof: houseOn ? 1 : house ? idle(house.id, houseGlow) : 0,
          dim: 0,
        };
      }
    }
  };

  const place = (): void => {
    const { from, to, t } = blendAt(story, focuses.length);
    const a = pose(from, story - from);
    const b = pose(to, story - to);
    const at = (key: Weight) => mix(a[key], b[key], t);

    const target = a.target.lerp(b.target, t);
    const yaw = at('yaw');
    const elevation = at('elevation');
    eye.set(
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    camera.position.copy(target).addScaledVector(eye, at('distance') * baseDistance);
    camera.lookAt(target);
    // Schermo largo: soggetto a destra delle schede (a sinistra dei comandi nella prima schermata).
    // Schermo stretto: soggetto spostato in verticale secondo `lift`.
    const shift = at('shift');
    const wide = size.width >= size.height;
    camera.setViewOffset(
      size.width,
      size.height,
      wide ? -shift * size.width * 0.5 : 0,
      wide ? 0 : at('lift') * size.height,
      size.width,
      size.height,
    );

    const climate = at('climate');
    const audio = at('audio');
    const weather = at('weather');
    // Onde: crescono e svaniscono a tempo, uguali in tutte le stanze.
    ringMaterials.forEach((material, k) => {
      const phase = (elapsed / BEAT + k / RINGS) % 1;
      material.opacity = audio * (1 - phase) * 0.7;
      for (const view of views) view.rings[k]?.scale.setScalar(0.15 + phase * 0.75);
    });
    views.forEach((view, i) => {
      const level = mix(a.lit[i] ?? 0, b.lit[i] ?? 0, t);
      view.lamp.color.copy(level > 0.01 ? colors.lampOn : colors.lampOff);
      view.lamp.emissiveIntensity = level * 0.9;
      view.device.emissiveIntensity =
        Math.max(mix(a.device[i] ?? 0, b.device[i] ?? 0, t), weather * 0.5) * 0.6;
      view.speaker.emissiveIntensity = audio * 0.7;
      for (const ring of view.rings) ring.visible = audio > 0.01;
      // Clima: dal blu (fresco) al pesca (caldo), secondo la temperatura simulata della stanza.
      const temperature = readings.rooms[view.id]?.temperature ?? (COLD + WARM) / 2;
      warmth.lerpColors(
        colors.cold,
        colors.warm,
        Math.min(1, Math.max(0, (temperature - COLD) / (WARM - COLD))),
      );
      view.floor.material.color.lerpColors(colors.floor, warmth, climate * 0.85);
      view.floor.material.emissive.copy(colors.glow);
      view.floor.material.emissiveIntensity = level * 0.35;
    });
    roofMaterial.opacity = 0.35 + at('roof') * 0.6;
    // Penombra: luce generale piu bassa, le stanze accese restano evidenti per l'emissione.
    const dim = at('dim');
    ambient.intensity = 0.9 - dim * 0.4;
    sun.intensity = 1.4 - dim * 0.6;

    audioLine.opacity = audio * 0.6;
    audioDots.opacity = audio;
    audioPulses.forEach((dot, k) => {
      const s = ((elapsed * 0.12 + k / PULSES) % 1) * loop.length;
      const from = loop[Math.floor(s)] as Vector3;
      const to = loop[(Math.floor(s) + 1) % loop.length] as Vector3;
      dot.position.lerpVectors(from, to, s % 1);
      dot.visible = audio > 0.01;
    });
    stationMaterial.emissiveIntensity = weather * 0.8;
    anemometer.rotation.y = elapsed * (0.6 + readings.weather.wind * 0.12);
    dataDots.opacity = weather;
    dataPulses.forEach((dot, k) => {
      const view = views[k] as RoomView;
      dot.position.lerpVectors(view.sensor, stationAt, (elapsed * 0.4 + k / views.length) % 1);
      dot.visible = weather > 0.01;
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
    for (const view of views) view.glow = Math.max(0, view.glow - dt);
    houseGlow = Math.max(0, houseGlow - dt);
    // Dimostrazione: a turno parte un'automazione, finche l'utente non ne sceglie una
    // (e solo nella prima schermata: sulle schede parla la scheda).
    if (interactive && selected === null && demoRooms.length > 0 && elapsed >= nextDemo) {
      fire(demoRooms[demoIndex % demoRooms.length] as string);
      demoIndex += 1;
      nextDemo = elapsed + DEMO_EVERY;
    }
    // I sensori avanzano solo mentre la scena anima: fuori schermo o fermi, restano fermi.
    sinceSim += dt;
    if (sinceSim >= SIM_EVERY) {
      sinceSim = 0;
      readings = sim.tick();
      simUi.show(readings);
    }
    draw();
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  const ui = bindPanelUi(container, {
    select(id) {
      selected = id;
      invalidate();
    },
  });

  // --- Puntatore: orbit orizzontale e selezione (solo nella prima schermata) --------------------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const floors = views.map((v) => v.floor);
  const pick = (x: number, y: number): string | null => {
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(floors, false)[0];
    return (hit?.object.userData.roomId as string | undefined) ?? null;
  };
  const detachOrbit = attachOrbit(canvas, {
    maxYaw: MAX_YAW,
    yaw: () => userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude,
    onYaw(value) {
      if (!interactive) return;
      userYaw = value;
      invalidate();
    },
    onClick(x, y) {
      if (interactive) ui.selectFromScene(pick(x, y));
    },
    onHover(x, y) {
      canvas.style.cursor = interactive && pick(x, y) ? 'pointer' : '';
    },
  });

  const fitDistance = (aspect: number): void => {
    // Distanza d'insieme: tutta la pianta nel riquadro. In verticale si stringe il margine:
    // meglio una casa che occupa quasi tutta la larghezza che tanto vuoto intorno.
    const portrait = aspect < 1;
    const span = Math.max(width, depth) + (portrait ? 0.2 : 1.2);
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const fill = portrait ? 0.55 : 0.68;
    baseDistance = Math.max((span * fill) / Math.tan(Math.min(horizontal, vertical)), 6) + 1;
  };

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
      fitDistance(camera.aspect);
      camera.updateProjectionMatrix();
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      ui.dispose();
      detachOrbit();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
