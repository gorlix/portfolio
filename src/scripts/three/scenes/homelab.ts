import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { HomelabModel } from '../../../lib/homelab';
import { bindHomelabUi } from '../homelab/ui';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Homelab (spec §12.1, §7.3): due piattaforme low-poly (Casa e Produzione), i nodi generati
 * dai dati e un fascio di luce che le unisce (la rete overlay). Tutto procedurale, nessun modello
 * esterno. I dati sono gli stessi della tabella testuale (src/lib/homelab.ts); pannelli e controlli
 * sono HTML veri, gestiti da ../homelab/ui.ts.
 * Orbit leggero solo in orizzontale: il canvas ha `touch-action: pan-y` e nessun ascoltatore della
 * rotella, quindi lo scroll della pagina non viene mai catturato.
 */

const REGION_GAP = 4.6;
const PLATFORM_RADIUS = 1.8;
const PLATFORM_HEIGHT = 0.36;
const PLATFORM_TOP = PLATFORM_HEIGHT / 2;
const NODE_SIZE = { w: 0.5, h: 0.95, d: 0.5 };
const NODE_SPACING = 0.95;
const BEAM_Y = PLATFORM_TOP + 0.45;
const PULSES = 3;
/** Radianti di rotazione massima a destra e a sinistra: si gira la scena, non la si ribalta. */
const MAX_YAW = 0.7;
const YAW_PER_PX = 0.006;
/** Sotto questa distanza un trascinamento e ancora un click. */
const CLICK_SLOP_PX = 6;
/** Oscillazione lenta finche l'utente non prende il controllo. */
const SWAY = { amplitude: 0.22, speed: 0.18 };

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function mount({ canvas, container, tier, data }: SceneContext): SceneInstance {
  const model = data as HomelabModel | undefined;
  // Senza dati non c'e niente da disegnare: il bootstrap ripiega sul testo.
  if (!model?.regions?.length) throw new Error('homelab: dati della scena assenti');

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
  const target = new Vector3(0, 0.45, 0);

  // Ogni risorsa GPU passa da qui, cosi dispose() non dimentica niente.
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));

  const colors = {
    platform: tint(['--surface', '--bg-alt']),
    home: tint(['--sec-homelab', '--text']),
    production: tint(['--ctp-mauve', '--sec-homelab']),
    node: tint(['--border', '--surface-hi']),
    selected: tint(['--sec-homelab', '--text']),
    led: tint(['--ctp-green', '--text']),
    beam: tint(['--ctp-sapphire', '--sec-homelab']),
    marker: tint(['--ctp-yellow', '--text']),
    light: tint(['--text']),
  };

  const platformGeometry = own(
    new CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 1.08, PLATFORM_HEIGHT, 6),
  );
  const platformEdges = own(new EdgesGeometry(platformGeometry));
  const platformMaterial = own(
    new MeshStandardMaterial({ color: colors.platform, flatShading: true, roughness: 0.9 }),
  );
  const edgeMaterial = {
    home: own(new LineBasicMaterial({ color: colors.home })),
    production: own(new LineBasicMaterial({ color: colors.production })),
  };
  const nodeGeometry = own(new BoxGeometry(NODE_SIZE.w, NODE_SIZE.h, NODE_SIZE.d));
  const nodeEdges = own(new EdgesGeometry(nodeGeometry));
  const nodeEdgeMaterial = own(new LineBasicMaterial({ color: colors.platform }));
  const ledGeometry = own(new BoxGeometry(NODE_SIZE.w * 0.62, 0.05, 0.02));
  const markerGeometry = own(new OctahedronGeometry(0.16, 0));
  const markerMaterial = own(
    new MeshStandardMaterial({
      color: colors.marker,
      emissive: colors.marker,
      emissiveIntensity: 0.35,
      flatShading: true,
    }),
  );

  const root = new Group();
  scene.add(root);

  interface NodeView {
    body: Mesh<BoxGeometry, MeshStandardMaterial>;
    leds: MeshBasicMaterial;
    marker: Mesh | null;
  }
  const nodes = new Map<string, NodeView>();
  const regionX = new Map<string, number>();

  model.regions.forEach((region, i) => {
    const x = (i - (model.regions.length - 1) / 2) * REGION_GAP;
    regionX.set(region.id, x);

    const platform = new Mesh(platformGeometry, platformMaterial);
    platform.position.set(x, 0, 0);
    platform.add(new LineSegments(platformEdges, edgeMaterial[region.kind]));
    root.add(platform);

    const count = region.nodes.length;
    region.nodes.forEach((node, j) => {
      // I nodi stanno in fila davanti alla camera, con il fronte (e le spie) verso chi guarda.
      const offset = (j - (count - 1) / 2) * NODE_SPACING;
      const body = new Mesh(
        nodeGeometry,
        own(new MeshStandardMaterial({ color: colors.node, flatShading: true, roughness: 0.7 })),
      );
      body.position.set(x + offset, PLATFORM_TOP + NODE_SIZE.h / 2, 0.25);
      body.userData.nodeId = node.id;
      body.add(new LineSegments(nodeEdges, nodeEdgeMaterial));

      // Spie frontali: tre strisce che in seguito racconteranno lo stato del nodo.
      const leds = own(new MeshBasicMaterial({ color: colors.led }));
      for (let k = 0; k < 3; k += 1) {
        const led = new Mesh(ledGeometry, leds);
        led.position.set(0, NODE_SIZE.h * (0.28 - k * 0.16), NODE_SIZE.d / 2 + 0.011);
        body.add(led);
      }

      let marker: Mesh | null = null;
      if (node.adrs.length > 0) {
        marker = new Mesh(markerGeometry, markerMaterial);
        marker.position.set(body.position.x, PLATFORM_TOP + NODE_SIZE.h + 0.38, body.position.z);
        marker.visible = false;
        root.add(marker);
      }
      root.add(body);
      nodes.set(node.id, { body, leds, marker });
    });
  });

  // Fascio dell'overlay tra le piattaforme, con impulsi che lo percorrono.
  const pulseGeometry = own(new SphereGeometry(0.07, 8, 6));
  const pulseMaterial = own(new MeshBasicMaterial({ color: colors.beam }));
  const beamMaterial = own(
    new MeshBasicMaterial({ color: colors.beam, transparent: true, opacity: 0.55 }),
  );
  const haloMaterial = own(
    new MeshBasicMaterial({ color: colors.beam, transparent: true, opacity: 0.16 }),
  );
  const beams: { from: number; to: number; pulses: Mesh[] }[] = [];
  for (const [a, b] of model.overlays) {
    const from = regionX.get(a);
    const to = regionX.get(b);
    if (from === undefined || to === undefined) continue;
    const length = Math.abs(to - from) - PLATFORM_RADIUS * 1.4;
    const mid = (from + to) / 2;
    for (const [radius, material] of [
      [0.03, beamMaterial],
      [0.11, haloMaterial],
    ] as const) {
      const beam = new Mesh(
        own(new CylinderGeometry(radius, radius, length, 8, 1, true)),
        material,
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.set(mid, BEAM_Y, 0);
      root.add(beam);
    }
    const pulses = Array.from({ length: PULSES }, () => {
      const pulse = new Mesh(pulseGeometry, pulseMaterial);
      root.add(pulse);
      return pulse;
    });
    const span = Math.sign(to - from) * (length / 2);
    beams.push({ from: mid - span, to: mid + span, pulses });
  }

  const light = colors.light;
  scene.add(new AmbientLight(light, 0.85));
  const sun = new DirectionalLight(light, 1.5);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  // --- Stato ------------------------------------------------------------------------------------
  let selected: string | null = null;
  let decisions = false;
  let yaw = 0;
  let userYaw: number | null = null;
  let elapsed = 0;

  const paintSelection = (): void => {
    for (const [id, view] of nodes) {
      const on = id === selected;
      view.body.material.color.copy(on ? colors.selected : colors.node);
      view.body.material.emissive.copy(on ? colors.selected : colors.platform);
      view.body.material.emissiveIntensity = on ? 0.25 : 0;
      if (view.marker) view.marker.visible = decisions;
    }
  };

  const place = (): void => {
    root.rotation.y = yaw;
    for (const beam of beams) {
      beam.pulses.forEach((pulse, k) => {
        const t = (elapsed * 0.35 + k / PULSES) % 1;
        pulse.position.set(beam.from + (beam.to - beam.from) * t, BEAM_Y, 0);
      });
    }
    for (const view of nodes.values()) {
      if (!view.marker) continue;
      view.marker.rotation.y = elapsed * 0.8;
    }
  };

  // --- Ciclo di disegno -------------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let disposed = false;
  const draw = (): void => {
    place();
    renderer.render(scene, camera);
  };
  /** A scena ferma (livello ridotto o fuori schermo) basta un fotogramma dopo ogni cambiamento. */
  const invalidate = (): void => {
    if (!frame && !disposed) draw();
  };
  const tick = (now: number): void => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    elapsed += dt;
    yaw = userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude;
    draw();
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  // --- Interfaccia HTML -------------------------------------------------------------------------
  const ui = bindHomelabUi(container, {
    select(nodeId) {
      selected = nodeId;
      paintSelection();
      invalidate();
    },
    layer(name, on) {
      if (name === 'decisions') decisions = on;
      paintSelection();
      invalidate();
    },
  });

  // --- Puntatore: orbit orizzontale e selezione -------------------------------------------------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const bodies = [...nodes.values()].map((v) => v.body);
  const pick = (event: PointerEvent): string | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(bodies, false)[0];
    return (hit?.object.userData.nodeId as string | undefined) ?? null;
  };

  let drag: { id: number; x: number; y: number; yaw: number; moved: boolean } | null = null;
  const onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, moved: false };
  };
  const onMove = (event: PointerEvent): void => {
    if (!drag || drag.id !== event.pointerId) {
      if (event.pointerType === 'mouse') canvas.style.cursor = pick(event) ? 'pointer' : '';
      return;
    }
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.hypot(dx, event.clientY - drag.y) < CLICK_SLOP_PX) return;
    if (!drag.moved) canvas.setPointerCapture(event.pointerId);
    drag.moved = true;
    userYaw = clamp(drag.yaw + dx * YAW_PER_PX, MAX_YAW);
    yaw = userYaw;
    invalidate();
  };
  const onUp = (event: PointerEvent): void => {
    if (!drag || drag.id !== event.pointerId) return;
    const wasClick = !drag.moved;
    drag = null;
    if (wasClick) ui.selectFromScene(pick(event));
  };
  // Il browser si e preso il gesto (scroll verticale): nessuna rotazione, nessun click.
  const onCancel = (): void => {
    drag = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  const fitCamera = (aspect: number): void => {
    // La camera arretra finche entrambe le piattaforme stanno nel riquadro, anche su schermi stretti.
    const width = REGION_GAP * (model.regions.length - 1) + PLATFORM_RADIUS * 2.6;
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const distance = Math.max(width / 2 / Math.tan(horizontal), 6) + 1.5;
    camera.position.copy(target).add(new Vector3(0, 0.5, 1).normalize().multiplyScalar(distance));
    camera.lookAt(target);
  };

  paintSelection();

  return {
    start() {
      if (disposed || frame || tier !== 'full') return;
      frame = requestAnimationFrame(tick);
    },
    stop,
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      fitCamera(camera.aspect);
      camera.updateProjectionMatrix();
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      ui.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
