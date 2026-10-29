import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  type Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Color as ThreeColor,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { bindHardwareUi } from '../hardware';
import { ease } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Scrivania (spec §7.3, PORT-79): lo sfondo fisso della Home di /human. Una scrivania
 * low-poly con monitor (terminale con cursore), tastiera split, stampante 3D, mensola con
 * mini-server e finestra con luce calda. Tutto procedurale, flat-shaded, colori solo dai token.
 *
 * Nella prima schermata gli oggetti con un popup (stampante, trackball, tastiera, monitor, mini-server,
 * finestra; ../hardware.ts) si possono indicare col mouse o toccare. La camera "respira" lentamente; scorrendo si avvicina
 * al monitor (posizione del racconto, ../story.ts) mentre lo sfondo sfuma nella sezione dopo.
 * Con reduced-motion e un solo fotogramma fermo sulla prima inquadratura.
 */

const FOV = 35;
/** Larghezza della scrivania da tenere nel riquadro, e distanza minima della camera. */
const DESK_WIDTH = 5.2;
const MIN_DISTANCE = 6;
/** Rincorsa della camera verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 5;
const BREATH = { amplitude: 0.07, speed: 0.35 };
const SCREEN = { x: 0, y: 1.95, z: -0.25 };
/** In verticale (telefono) si inquadra il centro della scrivania e la si alza sopra il vetro. */
const NARROW_WIDTH = 3.1;
const NARROW_SIDE = 0.35;
const UP_SHIFT_NARROW = 0.75;
/** Larghezza dello schermo da tenere nel riquadro quando la camera arriva al monitor. */
const SCREEN_FIT_WIDTH = 2.7;
const SIDE_SHIFT_WIDE = 0.9;

const TERMINAL_LINES = [
  '$ git log --oneline',
  'a1b2c3d fix: ci verde',
  '$ make build',
  'compilo... ok',
  '$ ssh server',
];

export function mount({ canvas, container, tier, profile }: SceneContext): SceneInstance {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const css = (names: readonly `--${string}`[]) => firstToken(container, names);
  const tint = (names: readonly `--${string}`[]): Color => new ThreeColor(css(names));

  const colors = {
    wall: tint(['--bg-alt', '--surface']),
    floor: tint(['--bg-deep', '--bg-alt']),
    desk: tint(['--surface-hi', '--border']),
    deskLeg: tint(['--surface', '--bg-alt']),
    body: tint(['--ctp-surface0', '--surface']),
    bodyDark: tint(['--bg-deep', '--bg-alt']),
    key: tint(['--ctp-surface2', '--border']),
    accent: tint(['--ctp-rosewater', '--sec-home', '--text']),
    printer: tint(['--ctp-mauve', '--sec-home']),
    trackball: tint(['--ctp-yellow', '--text']),
    trackballBall: tint(['--ctp-crust', '--bg-deep']),
    filament: tint(['--ctp-peach', '--text']),
    led: tint(['--ctp-green', '--text']),
    ledAlt: tint(['--ctp-sapphire', '--text']),
    ledIdle: tint(['--ctp-surface1', '--border']),
    window: tint(['--ctp-yellow', '--text']),
    light: tint(['--text']),
    warm: tint(['--ctp-peach', '--ctp-yellow', '--text']),
  };

  const unit = own(new BoxGeometry(1, 1, 1));
  const materials = new Map<string, MeshStandardMaterial>();
  const lit = (name: keyof typeof colors, roughness = 0.85): MeshStandardMaterial => {
    const key = `${name}:${roughness}`;
    let material = materials.get(key);
    if (!material) {
      material = own(
        new MeshStandardMaterial({ color: colors[name], flatShading: true, roughness }),
      );
      materials.set(key, material);
    }
    return material;
  };
  const box = (
    parent: Group,
    size: [number, number, number],
    at: [number, number, number],
    material: MeshStandardMaterial | MeshBasicMaterial,
  ): Mesh => {
    const mesh = new Mesh(unit, material);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };

  const root = new Group();
  scene.add(root);

  // --- Stanza: parete di fondo e pavimento -------------------------------------------------------
  box(root, [14, 7, 0.2], [0, 3, -2.6], lit('wall'));
  box(root, [14, 0.2, 7], [0, -0.1, 0.8], lit('floor'));

  // --- Scrivania ---------------------------------------------------------------------------------
  const DESK_TOP = 1.4;
  box(root, [DESK_WIDTH, 0.14, 1.9], [0, DESK_TOP, 0], lit('desk'));
  for (const x of [-DESK_WIDTH / 2 + 0.15, DESK_WIDTH / 2 - 0.15]) {
    for (const z of [-0.8, 0.8])
      box(root, [0.12, DESK_TOP, 0.12], [x, DESK_TOP / 2, z], lit('deskLeg'));
  }
  const top = DESK_TOP + 0.07;

  // --- Monitor con terminale ---------------------------------------------------------------------
  const monitor = new Group();
  monitor.name = 'monitor';
  root.add(monitor);
  box(monitor, [0.7, 0.05, 0.4], [0, top + 0.025, -0.25], lit('bodyDark'));
  box(monitor, [0.12, 0.45, 0.1], [0, top + 0.25, -0.35], lit('bodyDark'));
  box(monitor, [2.3, 1.35, 0.1], [SCREEN.x, SCREEN.y, SCREEN.z - 0.05], lit('bodyDark'));

  const term = document.createElement('canvas');
  term.width = 512;
  term.height = 300;
  const ctx = term.getContext('2d');
  const texture = own(new CanvasTexture(term));
  texture.colorSpace = SRGBColorSpace;
  const background = css(['--bg-deep', '--bg']);
  const ink = css(['--ctp-green', '--text']);
  const prompt = css(['--ctp-rosewater', '--sec-home', '--text']);
  const paintTerminal = (cursorOn: boolean): void => {
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, term.width, term.height);
    ctx.font = '22px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    TERMINAL_LINES.forEach((line, i) => {
      ctx.fillStyle = line.startsWith('$') ? prompt : ink;
      ctx.fillText(line, 22, 22 + i * 36);
    });
    if (cursorOn) {
      ctx.fillStyle = ink;
      ctx.fillRect(22, 22 + TERMINAL_LINES.length * 36, 14, 26);
    }
    texture.needsUpdate = true;
  };
  paintTerminal(true);
  const screen = new Mesh(
    own(new BoxGeometry(2.1, 1.15, 0.02)),
    own(new MeshBasicMaterial({ map: texture })),
  );
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  monitor.add(screen);

  // --- Tastiera split (due meta inclinate, tasti istanziati) -------------------------------------
  const keyboard = new Group();
  keyboard.name = 'moonlander';
  root.add(keyboard);
  const COLS = 6;
  const ROWS = 4;
  const keys = own(new InstancedMesh(unit, lit('key'), COLS * ROWS * 2));
  const m = new Matrix4();
  let index = 0;
  for (const side of [-1, 1] as const) {
    box(keyboard, [1.0, 0.06, 0.62], [side * 0.8, top + 0.03, 0.55], lit('body')).rotation.y =
      -side * 0.22;
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const local = new Vector3((c - (COLS - 1) / 2) * 0.15, 0.09, (r - (ROWS - 1) / 2) * 0.13);
        local.applyAxisAngle(new Vector3(0, 1, 0), -side * 0.22);
        m.makeScale(0.12, 0.05, 0.1);
        m.setPosition(side * 0.8 + local.x, top + local.y, 0.55 + local.z);
        keys.setMatrixAt(index, m);
        index += 1;
      }
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keyboard.add(keys);

  // --- Trackball (stile Ploopy Adept) tra le due meta: corpo ottagonale, pallina e tre tasti ------
  const ball = new Group();
  ball.name = 'trackball';
  ball.position.set(0, top, 0.55);
  keyboard.add(ball);
  const hull = new Mesh(own(new CylinderGeometry(0.23, 0.26, 0.09, 8)), lit('trackball'));
  hull.position.y = 0.045;
  hull.rotation.y = Math.PI / 8;
  ball.add(hull);
  const sphere = new Mesh(own(new SphereGeometry(0.11, 8, 6)), lit('trackballBall', 0.4));
  sphere.position.y = 0.11;
  ball.add(sphere);
  for (const x of [-0.12, 0, 0.12]) box(ball, [0.1, 0.03, 0.07], [x, 0.1, 0.17], lit('key'));

  // --- Stampante 3D con pezzo che cresce ----------------------------------------------------------
  const printer = new Group();
  printer.name = 'printer';
  printer.position.set(DESK_WIDTH / 2 - 0.85, top, -0.1);
  root.add(printer);
  box(printer, [0.9, 0.08, 0.9], [0, 0.04, 0], lit('bodyDark'));
  for (const x of [-0.4, 0.4]) box(printer, [0.07, 1.0, 0.07], [x, 0.54, -0.4], lit('printer'));
  box(printer, [0.9, 0.07, 0.07], [0, 1.0, -0.4], lit('printer'));
  const gantry = box(printer, [0.14, 0.14, 0.28], [0, 0.82, -0.25], lit('bodyDark'));
  const part = box(printer, [0.3, 0.3, 0.3], [0, 0.23, 0.05], lit('filament'));
  part.scale.y = 0.3;

  // --- Mensola con mini-server -------------------------------------------------------------------
  const shelf = new Group();
  shelf.name = 'server';
  shelf.position.set(-DESK_WIDTH / 2 + 1.0, 3.2, -2.1);
  root.add(shelf);
  box(shelf, [2.0, 0.08, 0.7], [0, 0, 0], lit('desk'));
  const ledGeometry = own(new BoxGeometry(0.05, 0.05, 0.02));
  const leds: { material: MeshBasicMaterial; period: number; offset: number }[] = [];
  [-0.65, 0, 0.65].forEach((x, i) => {
    box(shelf, [0.5, 0.42, 0.45], [x, 0.25, 0], lit('body'));
    for (let l = 0; l < 3; l += 1) {
      const material = own(new MeshBasicMaterial({ color: i === 1 ? colors.ledAlt : colors.led }));
      const led = new Mesh(ledGeometry, material);
      led.position.set(x - 0.15 + l * 0.08, 0.25 + (l % 2) * 0.1, 0.235);
      shelf.add(led);
      leds.push({ material, period: 0.7 + l * 0.45 + i * 0.2, offset: i + l });
    }
  });
  for (const x of [-0.85, 0.85]) box(shelf, [0.08, 0.35, 0.5], [x, -0.2, 0], lit('deskLeg'));

  // --- Finestra con luce calda -------------------------------------------------------------------
  const win = new Group();
  win.name = 'window';
  win.position.set(DESK_WIDTH / 2 - 1.6, 3.4, -2.48);
  root.add(win);
  box(win, [1.7, 1.9, 0.08], [0, 0, 0], lit('desk'));
  const glow = own(new MeshBasicMaterial({ color: colors.window }));
  box(win, [1.5, 1.7, 0.04], [0, 0, 0.05], glow);
  box(win, [0.06, 1.7, 0.06], [0, 0, 0.09], lit('desk'));
  box(win, [1.5, 0.06, 0.06], [0, 0, 0.09], lit('desk'));

  // --- Luci --------------------------------------------------------------------------------------
  scene.add(new AmbientLight(colors.light, 0.75));
  const fill = new DirectionalLight(colors.light, 1.1);
  fill.position.set(-3, 6, 5);
  scene.add(fill);
  const warm = new DirectionalLight(colors.warm, 1.0);
  warm.position.set(4, 3, 1);
  scene.add(warm);

  // --- Camera: due inquadrature, interpolate dal racconto ----------------------------------------
  let storyTarget = 0;
  let story = 0;
  let elapsed = 0;
  let aspect = 1;
  let baseDistance = 8;
  let nearDistance = 3;
  const target = new Vector3();
  const place = (): void => {
    const t = ease(Math.min(1, story));
    const wide = aspect >= 1.3;
    // Prima inquadratura: scena spostata da un lato (largo) o in alto (stretto), lasciando spazio al vetro.
    const shift = (1 - t) * (wide ? SIDE_SHIFT_WIDE : 0);
    const lift = (1 - t) * (wide ? 0 : UP_SHIFT_NARROW);
    const breath = Math.sin(elapsed * BREATH.speed) * BREATH.amplitude * (1 - t * 0.6);
    const far = new Vector3(wide ? 0.6 : NARROW_SIDE, 3.1, baseDistance);
    const near = new Vector3(SCREEN.x, SCREEN.y + 0.05, SCREEN.z + nearDistance);
    camera.position.lerpVectors(far, near, t);
    camera.position.x += breath * 3;
    camera.position.y += breath * 1.5;
    target.set(wide ? 0 : NARROW_SIDE * (1 - t), 2.2 + (SCREEN.y - 2.2) * t, SCREEN.z * t);
    target.x -= shift;
    target.y -= lift;
    camera.lookAt(target);
  };

  // --- Popup sull'hardware: oggetti indicabili, punto di ancoraggio e puntatore -------------------
  const pickables = [monitor, keyboard, printer, shelf, win];
  root.updateMatrixWorld(true);
  const anchors = new Map<string, Vector3>();
  for (const group of [...pickables, ball]) {
    const box = new Box3().setFromObject(group);
    const at = box.getCenter(new Vector3());
    at.y = box.max.y;
    anchors.set(group.name, at);
  }
  // La tastiera e larga e la trackball sta in mezzo: il popup della tastiera ancora su una meta.
  anchors.set('moonlander', new Vector3(-0.8, top + 0.2, 0.55));
  let size = { width: 1, height: 1 };
  const hw = bindHardwareUi(container, {
    anchor(id) {
      const at = anchors.get(id);
      if (!at) return null;
      const p = at.clone().project(camera);
      if (p.z > 1) return null;
      return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height };
    },
  });
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pick = (event: PointerEvent | MouseEvent): string | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      // Il gruppo con nome piu vicino: la trackball sta dentro la tastiera ma ha il suo popup.
      for (let o: Object3D | null = hit.object; o; o = o.parent)
        if (anchors.has(o.name)) return o.name;
    }
    return null;
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    const id = pick(event);
    canvas.style.cursor = id ? 'pointer' : '';
    hw.hover(id);
  };
  const onLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') hw.hover(null);
  };
  const onClick = (event: MouseEvent): void => hw.tap(pick(event));
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave, { passive: true });
  canvas.addEventListener('click', onClick);

  // --- Ciclo di disegno --------------------------------------------------------------------------
  const BLINK = 0.55;
  let cursorOn = true;
  let frame = 0;
  let last = 0;
  let disposed = false;
  const animate = (): void => {
    const blink = Math.floor(elapsed / BLINK) % 2 === 0;
    if (blink !== cursorOn) {
      cursorOn = blink;
      paintTerminal(blink);
    }
    for (const led of leds) {
      const on = Math.sin(elapsed * ((Math.PI * 2) / led.period) + led.offset) > -0.2;
      led.material.color.copy(on ? colors.led : colors.ledIdle);
    }
    // Il pezzo cresce a strati e ricomincia; il carrello lo segue.
    const cycle = (elapsed % 12) / 12;
    part.scale.y = 0.04 + cycle * 0.3;
    part.position.y = 0.08 + part.scale.y / 2;
    gantry.position.y = 0.08 + part.scale.y + 0.2;
    gantry.position.x = Math.sin(elapsed * 1.3) * 0.12;
  };
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
    if (hw.isOpen()) hw.reposition();
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
    animate();
    draw();
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  const fitDistance = (): void => {
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const wideNeed =
      aspect >= 1.3 ? DESK_WIDTH * 1.35 : aspect >= 1 ? DESK_WIDTH * 1.05 : NARROW_WIDTH;
    baseDistance = Math.max(wideNeed / 2 / Math.tan(horizontal), MIN_DISTANCE);
    nearDistance = Math.max(3, SCREEN_FIT_WIDTH / 2 / Math.tan(horizontal));
  };

  return {
    start() {
      if (disposed || frame || tier !== 'full') return;
      frame = requestAnimationFrame(tick);
    },
    stop,
    setStory(position, interactive) {
      storyTarget = Math.max(0, position);
      hw.setActive(interactive);
      if (!interactive) canvas.style.cursor = '';
      if (tier !== 'full') story = storyTarget;
      invalidate();
    },
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      size = { width, height };
      aspect = width / height;
      camera.aspect = aspect;
      fitDistance();
      camera.updateProjectionMatrix();
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      hw.dispose();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
