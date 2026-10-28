import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { DomoticaModel } from '../../../lib/domotica';
import { attachOrbit } from '../orbit';
import { bindPanelUi } from '../panel';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Domotica (spec §12.2): casa low-poly vista dall'alto, senza tetto, con una stanza per voce
 * dei dati. Quando "parte" un'automazione la sua stanza si illumina; la scelta di una stanza
 * (dal canvas o dai pulsanti HTML, ../panel.ts) apre il pannello con trigger, condizioni e azioni.
 * Pianta generica, non la casa vera. Tutto procedurale, colori solo dai token del tema.
 */

const ROOM = 2.2;
const WALL = { height: 0.55, thickness: 0.08 };
const FLOOR_HEIGHT = 0.12;
const MAX_YAW = 0.6;
const SWAY = { amplitude: 0.18, speed: 0.15 };
/** Secondi tra un'automazione dimostrativa e la successiva, e durata del bagliore. */
const DEMO_EVERY = 3.5;
const GLOW_SECONDS = 2.2;

export function mount({ canvas, container, tier, data }: SceneContext): SceneInstance {
  const model = data as DomoticaModel | undefined;
  const rooms = model?.rooms.filter((r) => r.kind === 'room') ?? [];
  const house = model?.rooms.find((r) => r.kind === 'house');
  if (rooms.length === 0) throw new Error('domotica: dati della scena assenti');

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: tier === 'full',
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'full' ? 2 : 1));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 80);
  const target = new Vector3(0, 0, 0);

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
  const edgeMaterial = own(new LineBasicMaterial({ color: colors.edge }));

  const root = new Group();
  scene.add(root);

  interface RoomView {
    floor: Mesh<BoxGeometry, MeshStandardMaterial>;
    lamp: MeshStandardMaterial;
    hasAutomations: boolean;
    /** Secondi di bagliore rimasti (0 = spenta). */
    glow: number;
  }
  const views = new Map<string, RoomView>();

  rooms.forEach((room, i) => {
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

    const lamp = own(
      new MeshStandardMaterial({
        color: colors.lampOff,
        emissive: colors.lampOn,
        emissiveIntensity: 0,
        flatShading: true,
      }),
    );
    const pole = new Mesh(poleGeometry, wallMaterial);
    pole.position.set(x - ROOM * 0.28, FLOOR_HEIGHT + 0.25, z - ROOM * 0.28);
    const shade = new Mesh(shadeGeometry, lamp);
    shade.position.set(pole.position.x, FLOOR_HEIGHT + 0.56, pole.position.z);
    // Un dispositivo generico per stanza: sensore, hub o schermo, l'importante e che si accenda.
    const device = new Mesh(deviceGeometry, wallMaterial);
    device.position.set(x + ROOM * 0.22, FLOOR_HEIGHT + 0.1, z + ROOM * 0.2);
    device.add(new LineSegments(own(new EdgesGeometry(deviceGeometry)), edgeMaterial));
    root.add(pole, shade, device);

    views.set(room.id, { floor, lamp, hasAutomations: room.automations.length > 0, glow: 0 });
  });

  // Perimetro della casa intera: un tetto solo accennato, che si illumina per le automazioni globali.
  // Piramide a base quadrata unitaria (raggio 1/sqrt2 ruotato di 45 gradi), poi scalata sulla pianta.
  const roofGeometry = own(new ConeGeometry(Math.SQRT1_2, 1.1, 4, 1, true));
  const roofMaterial = own(
    new LineBasicMaterial({ color: colors.roof, transparent: true, opacity: 0.35 }),
  );
  const pyramid = new LineSegments(own(new EdgesGeometry(roofGeometry)), roofMaterial);
  pyramid.rotation.y = Math.PI / 4;
  const roof = new Group();
  roof.add(pyramid);
  roof.scale.set(width + 0.2, 1, depth + 0.2);
  roof.position.y = FLOOR_HEIGHT + WALL.height + 0.85;
  root.add(roof);
  let houseGlow = 0;

  scene.add(new AmbientLight(colors.light, 0.9));
  const sun = new DirectionalLight(colors.light, 1.4);
  sun.position.set(-3, 7, 4);
  scene.add(sun);

  // --- Stato ------------------------------------------------------------------------------------
  let selected: string | null = null;
  let yaw = 0;
  let userYaw: number | null = null;
  let elapsed = 0;
  let nextDemo = 1;
  const demoRooms = [...(model?.rooms ?? [])]
    .filter((r) => r.automations.length > 0)
    .map((r) => r.id);
  let demoIndex = 0;

  const fire = (id: string): void => {
    if (house && id === house.id) houseGlow = GLOW_SECONDS;
    const view = views.get(id);
    if (view) view.glow = GLOW_SECONDS;
  };

  const paint = (): void => {
    const houseOn = selected === house?.id;
    for (const [id, view] of views) {
      const on = id === selected || houseOn;
      const level = on ? 1 : Math.min(view.glow / GLOW_SECONDS, 1);
      view.lamp.color.copy(level > 0 ? colors.lampOn : colors.lampOff);
      view.lamp.emissiveIntensity = level * 0.9;
      view.floor.material.emissive.copy(colors.glow);
      view.floor.material.emissiveIntensity = level * 0.35;
    }
    const roofLevel = houseOn ? 1 : Math.min(houseGlow / GLOW_SECONDS, 1);
    roofMaterial.opacity = 0.35 + roofLevel * 0.6;
    root.rotation.y = yaw;
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let disposed = false;
  const draw = (): void => {
    paint();
    renderer.render(scene, camera);
  };
  const invalidate = (): void => {
    if (!frame && !disposed) draw();
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    elapsed += dt;
    yaw = userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude;
    for (const view of views.values()) view.glow = Math.max(0, view.glow - dt);
    houseGlow = Math.max(0, houseGlow - dt);
    // Dimostrazione: a turno parte un'automazione, finche l'utente non ne sceglie una.
    if (selected === null && demoRooms.length > 0 && elapsed >= nextDemo) {
      fire(demoRooms[demoIndex % demoRooms.length] as string);
      demoIndex += 1;
      nextDemo = elapsed + DEMO_EVERY;
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

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const floors = [...views.values()].map((v) => v.floor);
  const pick = (x: number, y: number): string | null => {
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(floors, false)[0];
    return (hit?.object.userData.roomId as string | undefined) ?? null;
  };
  const detachOrbit = attachOrbit(canvas, {
    maxYaw: MAX_YAW,
    yaw: () => yaw,
    onYaw(value) {
      userYaw = value;
      yaw = value;
      invalidate();
    },
    onClick(x, y) {
      ui.selectFromScene(pick(x, y));
    },
    onHover(x, y) {
      canvas.style.cursor = pick(x, y) ? 'pointer' : '';
    },
  });

  const fitCamera = (aspect: number): void => {
    const span = Math.max(width, depth) + 1.2;
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    // Vista dall alto e inclinata: la pianta occupa piu spazio in verticale, da qui il margine.
    const distance = Math.max((span * 0.68) / Math.tan(Math.min(horizontal, vertical)), 6) + 1;
    camera.position.copy(target).add(new Vector3(0, 1.15, 1).normalize().multiplyScalar(distance));
    camera.lookAt(target);
  };

  return {
    start() {
      if (disposed || frame || tier !== 'full') return;
      frame = requestAnimationFrame(tick);
    },
    stop,
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fitCamera(camera.aspect);
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
