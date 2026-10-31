import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  type Vector3Tuple,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor } from '../capabilities';
import { buildDesk, dimAt, linesAt, logoutAt, SCREEN, SEAT, shotsFor } from '../contatti/desk';
import { cameraAt, cardFraming, fitDistance, type Shot } from '../framing';
import type { Rgb } from '../interessi/mesher';
import { createPenguin } from '../penguin';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Contatti (spec §13), immersiva (PORT-99): una scrivania buia con un terminale che si accende
 * e il pinguino seduto accanto, fermo. Con lo scroll la camera va sullo schermo, le righe di prompt
 * compaiono piano; all'uscita lo schermo batte il comando di chiusura e la luce si abbassa. Tutto
 * dipende dallo scroll: a scroll fermo non si muove niente e nessun fotogramma resta in coda.
 */

export interface ContattiData {
  /** Comando battuto sullo schermo all'uscita (dai contenuti, come il saluto). */
  command: string;
}

const FOV = 30;
/** Rincorsa del racconto verso lo scroll (1/s) e durata dell'accensione (s). */
const STORY_CATCH_UP = 4;
const POWER_ON = 1.1;
const EPSILON = 0.0005;
/** Quanta luce resta dopo il comando di chiusura. */
const DIM_FLOOR = 0.3;
/** Superficie dello schermo: righe, margini e lunghezze (px). */
const TEXTURE_W = 512;
const TEXTURE_H = 368;
const MARGIN = 28;
const ROW = 44;
const BAR_H = 14;
const BARS = [260, 190, 320, 150, 240, 300];

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const { command } = (data as ContattiData | undefined) ?? { command: '' };
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(pixelRatioFor(profile, window.devicePixelRatio));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 3, 400);

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));
  const channels = (color: Color): Rgb => [color.r, color.g, color.b];
  const night = tint(['--bg-deep', '--bg']);
  const surface = tint(['--surface', '--bg-alt']);
  const raised = tint(['--surface-hi', '--surface']);
  const text = tint(['--text']);
  const accent = tint(['--sec-contatti', '--text']);
  const peach = tint(['--ctp-peach', '--text']);
  const prompt = tint(['--ctp-green', '--text']);

  const desk = buildDesk({
    wall: channels(night.clone().lerp(surface, 0.1)),
    desk: channels(surface.clone().lerp(peach, 0.12)),
    pad: channels(night),
    body: channels(raised.clone().lerp(text, 0.12)),
    bodyDark: channels(raised),
    key: channels(raised.clone().lerp(text, 0.25)),
    keyAlt: channels(raised.clone().lerp(accent, 0.6)),
    mug: channels(raised.clone().lerp(accent, 0.45)),
    paper: channels(raised.clone().lerp(text, 0.55)),
  });
  const geometry = own(new BufferGeometry());
  geometry.setAttribute('position', new BufferAttribute(desk.positions(), 3));
  geometry.setAttribute('color', new BufferAttribute(desk.colors(), 3));
  const painted = own(
    new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
  );
  scene.add(new Mesh(geometry, painted));

  // Schermo: una superficie disegnata in 2D, ridisegnata solo quando cambia cosa mostra.
  const surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = TEXTURE_W;
  surfaceCanvas.height = TEXTURE_H;
  const pen = surfaceCanvas.getContext('2d');
  const screenTexture = own(new CanvasTexture(surfaceCanvas));
  screenTexture.colorSpace = SRGBColorSpace;
  screenTexture.minFilter = LinearFilter;
  screenTexture.generateMipmaps = false;
  const screenMaterial = own(new MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
  const screen = new Mesh(own(new PlaneGeometry(SCREEN.width, SCREEN.height)), screenMaterial);
  screen.position.set(0, SCREEN.y, SCREEN.z);
  scene.add(screen);

  const font = `bold 34px ${getComputedStyle(container).getPropertyValue('--font-mono') || 'monospace'}`;
  const style = (color: Color) => `#${color.getHexString()}`;
  let shown = '';
  const paintScreen = (lines: number, typed: number): void => {
    const state = `${lines}/${typed}`;
    if (!pen || state === shown) return;
    shown = state;
    pen.fillStyle = style(night.clone().lerp(accent, 0.05));
    pen.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
    const left = MARGIN;
    for (let i = 0; i < lines; i += 1) {
      const y = MARGIN + i * ROW;
      pen.fillStyle = style(prompt);
      pen.fillRect(left, y, 18, BAR_H);
      pen.fillStyle = style(accent);
      pen.fillRect(left + 34, y, BARS[i % BARS.length] as number, BAR_H);
    }
    // Cursore fermo: subito dopo l'ultima cosa scritta, niente lampeggio.
    const row = MARGIN + lines * ROW;
    pen.font = font;
    pen.textBaseline = 'top';
    const words = command.slice(0, typed);
    pen.fillStyle = style(text);
    pen.fillText(words, left, row - 10);
    pen.fillStyle = style(accent);
    pen.fillRect(left + (typed > 0 ? pen.measureText(words).width + 10 : 0), row - 6, 18, 30);
    screenTexture.needsUpdate = true;
  };

  const penguin = own(
    createPenguin({
      body: tint(['--ctp-surface2', '--surface-hi']),
      belly: text,
      beak: peach,
      eye: night,
    }),
  );
  penguin.setPose('sit');
  penguin.root.scale.setScalar(SEAT.scale);
  penguin.root.position.set(SEAT.x, 0, SEAT.z);
  penguin.root.rotation.y = SEAT.heading;
  scene.add(penguin.root);

  // Stanza quasi al buio: la luce vera viene dallo schermo, verso la camera.
  const room = new AmbientLight(text, 1);
  const glow = new DirectionalLight(text.clone().lerp(accent, 0.6), 1);
  glow.position.set(-6, 14, 30);
  scene.add(room, glow);

  // --- Stato ------------------------------------------------------------------------------------
  const names = moments.length > 0 ? moments : ['overview'];
  let storyTarget = 0;
  let story = 0;
  // Senza ciclo (statica) lo schermo e gia acceso.
  let power = tier === 'full' ? 0 : 1;
  let size = { width: 1, height: 1 };

  const place = (): void => {
    const table = shotsFor(size.width < size.height);
    const shots = names.map((name) => table[name] ?? (table.overview as Shot));
    const aspect = size.width / size.height;
    const distances = shots.map((s) => fitDistance(s.spanH, s.spanW, aspect, FOV));
    const { eye, target, from, to, t } = cameraAt(shots, distances, story);
    camera.position.set(...(eye as Vector3Tuple));
    camera.lookAt(...(target as Vector3Tuple));
    // Prima schermata centrata; sulle schede il soggetto si scosta dalla scheda.
    const framing = cardFraming(size.width);
    const offset = (index: number) =>
      names[index] === 'overview' ? { shift: 0, lift: 0 } : framing;
    const a = offset(from);
    const b = offset(to);
    camera.setViewOffset(
      size.width,
      size.height,
      -(a.shift + (b.shift - a.shift) * t) * size.width * 0.5,
      (a.lift + (b.lift - a.lift) * t) * size.height,
      size.width,
      size.height,
    );

    paintScreen(linesAt(story), Math.ceil(logoutAt(story) * command.length));
    const light = 1 - dimAt(story) * (1 - DIM_FLOOR);
    screenMaterial.color.setScalar(power * (0.55 + 0.45 * light));
    room.intensity = 0.25 + 0.75 * light;
    glow.intensity = (0.3 + 1.5 * power) * light;
  };

  // --- Ciclo ------------------------------------------------------------------------------------
  // Il ciclo gira solo finche qualcosa si muove: accensione e rincorsa dello scroll.
  let frame = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    power = Math.min(1, power + dt / POWER_ON);
    const gap = storyTarget - story;
    story = Math.abs(gap) < EPSILON ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    draw();
    if (power < 1 || story !== storyTarget) frame = requestAnimationFrame(tick);
    else {
      frame = 0;
      last = 0;
    }
  };
  const wake = (): void => {
    if (running && !frame) frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  return {
    start() {
      if (disposed || tier !== 'full' || running) return;
      running = true;
      draw();
      wake();
    },
    stop,
    setStory(position) {
      storyTarget = Math.max(0, position);
      if (running) wake();
      else {
        // Statica (o fuori schermo): si salta al momento e si ridisegna una volta.
        story = storyTarget;
        if (!disposed) draw();
      }
    },
    resize(w, h) {
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      size = { width: w, height: h };
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!frame) draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
