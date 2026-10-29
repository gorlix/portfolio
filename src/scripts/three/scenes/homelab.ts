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
  OctahedronGeometry,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { HomelabModel } from '../../../lib/homelab';
import { pixelRatioFor } from '../capabilities';
import { createSimulator, type LogLine, seedFrom } from '../homelab/metrics';
import {
  buildCable,
  buildPlatform,
  buildRack,
  buildSwitch,
  type ModelColors,
  type RackView,
} from '../homelab/model';
import { bindHomelabUi } from '../homelab/ui';
import { attachOrbit } from '../orbit';
import { blendAt, ease } from '../story';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Homelab (spec §12.1, §7.3): due piattaforme low-poly (Casa e Produzione) con rack, switch
 * e cavi generati dai dati, e un fascio di luce che le unisce (la rete overlay). Tutto procedurale
 * (../homelab/model.ts), nessun modello esterno. I dati sono gli stessi della tabella testuale
 * (src/lib/homelab.ts); pannelli e controlli sono HTML veri, gestiti da ../homelab/ui.ts.
 *
 * Scena immersiva (PORT-76/77): e lo sfondo fisso della sezione. Nella prima schermata si usa
 * (orbit orizzontale, click sui nodi, layer e failover dai comandi); scorrendo, ogni scheda e un
 * "momento" con la sua inquadratura e i suoi layer, e la posizione del racconto (../story.ts)
 * interpola tra un momento e il successivo. Lo scroll della pagina non viene mai catturato.
 * Metriche e log sono simulati con un seme (../homelab/metrics.ts) e avanzano solo mentre la scena
 * anima; il gesto di failover sposta il VIP, il carico e i log sul nodo di backup.
 */

const REGION_GAP = 4.6;
const PLATFORM_RADIUS = 1.8;
const PLATFORM_HEIGHT = 0.36;
const PLATFORM_TOP = PLATFORM_HEIGHT / 2;
const NODE_SPACING = 0.95;
const NODE_Z = 0.25;
const SWITCH_Z = -0.6;
const BEAM_Y = PLATFORM_TOP + 0.45;
const PULSES = 3;
/** Radianti di rotazione massima a destra e a sinistra: si gira la scena, non la si ribalta. */
const MAX_YAW = 0.7;
/** Oscillazione lenta finche l'utente non prende il controllo. */
const SWAY = { amplitude: 0.22, speed: 0.18 };
/** Prima schermata con la colonna dei comandi a destra (22rem): zoom indietro e soggetto a sinistra. */
const SIDE_CONTROLS = { minWidth: 1152, distance: 1.22, shift: -0.22 };

/** Rincorsa della camera verso la posizione chiesta dallo scroll (1/s). */
const STORY_CATCH_UP = 5;

/** Secondi reali tra un passo della simulazione e il successivo, e punti delle sparkline. */
const SIM_EVERY = 1.2;
const SPARK_POINTS = 30;
/** Ora simulata d'inizio: sera, quando l'homelab lavora di piu. */
const SIM_START_MINUTE = 19 * 60;
const VIP_SPEED = 3;
const UP = new Vector3(0, 1, 0);

/** Inquadratura e layer di un momento del racconto. */
interface Pose {
  target: Vector3;
  /** Rotazione orizzontale, elevazione (radianti) e distanza (multiplo di quella d'insieme). */
  yaw: number;
  elevation: number;
  distance: number;
  /** Spostamento del soggetto nel riquadro: verso destra su schermi larghi, verso l'alto su stretti. */
  shift: number;
  decisions: number;
  backup: number;
  wip: number;
  failover: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mount({
  canvas,
  container,
  tier,
  profile,
  data,
  moments = [],
}: SceneContext): SceneInstance {
  const model = data as HomelabModel | undefined;
  // Senza dati non c'e niente da disegnare: il bootstrap ripiega sul testo.
  if (!model?.regions?.length) throw new Error('homelab: dati della scena assenti');

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

  // Ogni risorsa GPU passa da qui, cosi dispose() non dimentica niente.
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const tools = { own };
  const tint = (names: readonly `--${string}`[]) => new Color(firstToken(container, names));

  const colors = {
    platform: tint(['--surface', '--bg-alt']),
    platformTop: tint(['--bg-alt', '--surface']),
    home: tint(['--sec-homelab', '--text']),
    production: tint(['--ctp-mauve', '--sec-homelab']),
    rack: tint(['--surface-hi', '--border']),
    server: tint(['--ctp-surface2', '--border']),
    selected: tint(['--sec-homelab', '--text']),
    led: tint(['--ctp-green', '--text']),
    ledIdle: tint(['--ctp-surface1', '--border']),
    cable: tint(['--border', '--surface-hi']),
    beam: tint(['--ctp-sapphire', '--sec-homelab']),
    marker: tint(['--ctp-yellow', '--text']),
    danger: tint(['--danger', '--ctp-red']),
    vip: tint(['--ctp-teal', '--sec-homelab']),
    backup: tint(['--ctp-sky', '--sec-homelab']),
    cloud: tint(['--ctp-lavender', '--surface-hi']),
    wip: tint(['--ctp-peach', '--text']),
    light: tint(['--text']),
  } satisfies ModelColors & Record<string, Color>;

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
    rack: RackView;
    /** Base del rack, sulla piattaforma. */
    base: Vector3;
    marker: Mesh | null;
  }
  const nodes = new Map<string, NodeView>();
  const regionX = new Map<string, number>();

  model.regions.forEach((region, i) => {
    const x = (i - (model.regions.length - 1) / 2) * REGION_GAP;
    regionX.set(region.id, x);

    const platform = buildPlatform(tools, colors, region.kind, PLATFORM_RADIUS, PLATFORM_HEIGHT);
    platform.position.set(x, 0, 0);
    root.add(platform);

    // Switch del sito sul retro della piattaforma: i cavi dei rack arrivano qui.
    const hub = buildSwitch(tools, colors);
    hub.position.set(x, PLATFORM_TOP, SWITCH_Z);
    root.add(hub);
    const port = new Vector3(x, PLATFORM_TOP + 0.08, SWITCH_Z + 0.13);

    const count = region.nodes.length;
    region.nodes.forEach((node, j) => {
      // I rack stanno in fila davanti alla camera, con il fronte (e le spie) verso chi guarda.
      const offset = (j - (count - 1) / 2) * NODE_SPACING;
      const rack = buildRack(tools, colors, {
        servers: 3 + Math.min(3, node.services.length),
        seed: seedFrom(node.id),
      });
      const base = new Vector3(x + offset, PLATFORM_TOP, NODE_Z);
      rack.group.position.copy(base);
      rack.hit.userData.nodeId = node.id;
      root.add(rack.group);
      root.add(
        buildCable(
          tools,
          colors,
          new Vector3(base.x, PLATFORM_TOP + rack.height * 0.85, NODE_Z - 0.28),
          port,
          0.12,
        ),
      );

      let marker: Mesh | null = null;
      if (node.adrs.length > 0) {
        marker = new Mesh(markerGeometry, markerMaterial);
        marker.position.set(base.x, PLATFORM_TOP + rack.height + 0.38, base.z);
        marker.visible = false;
        root.add(marker);
      }
      nodes.set(node.id, { rack, base, marker });
    });
  });
  const rackTop = (nodeId: string | undefined, above: number): Vector3 => {
    const view = nodeId ? nodes.get(nodeId) : undefined;
    return view ? view.base.clone().setY(PLATFORM_TOP + view.rack.height + above) : new Vector3();
  };

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

  // --- Layer Backup 3-2-1: frecce dal nodo d'origine verso i tre destinatari ------------------
  const backupLayer = new Group();
  backupLayer.visible = false;
  root.add(backupLayer);
  const arrowMaterial = own(new LineBasicMaterial({ color: colors.backup, transparent: true }));
  const tipGeometry = own(new ConeGeometry(0.07, 0.2, 6));
  const tipMaterial = own(new MeshBasicMaterial({ color: colors.backup, transparent: true }));
  const cloudGeometry = own(new IcosahedronGeometry(0.22, 0));
  const cloudMaterial = own(
    new MeshStandardMaterial({
      color: colors.cloud,
      flatShading: true,
      roughness: 0.8,
      transparent: true,
    }),
  );
  const backupMaterials = [arrowMaterial, tipMaterial, cloudMaterial];
  const diskGeometry = own(new CylinderGeometry(0.28, 0.28, 0.12, 8));
  const backupPulses: { from: Vector3; to: Vector3; mesh: Mesh }[] = [];
  if (nodes.has(model.backup.source.node)) {
    const from = rackTop(model.backup.source.node, 0.1);
    const clouds = model.backup.targets.filter((t) => t.medium === 'cloud');
    model.backup.targets.forEach((t) => {
      const to =
        t.medium === 'cloud'
          ? new Vector3((clouds.indexOf(t) - (clouds.length - 1) / 2) * 2.2, 2.5, -1.4)
          : new Vector3(from.x + 1.1, PLATFORM_TOP + 0.08, 1.35);
      // Destinatario: una nuvola di tre facce per il cloud, un disco per la copia locale.
      if (t.medium === 'cloud') {
        for (const [dx, dy, scale] of [
          [-0.2, 0, 0.9],
          [0.18, 0.04, 1],
          [0, 0.16, 0.8],
        ] as const) {
          const puff = new Mesh(cloudGeometry, cloudMaterial);
          puff.position.set(to.x + dx, to.y + dy, to.z);
          puff.scale.setScalar(scale);
          backupLayer.add(puff);
        }
      } else {
        const disk = new Mesh(diskGeometry, cloudMaterial);
        disk.position.copy(to);
        backupLayer.add(disk);
      }
      const end = to.clone().lerp(from, 0.12);
      backupLayer.add(
        new Line(own(new BufferGeometry().setFromPoints([from, end])), arrowMaterial),
      );
      const tip = new Mesh(tipGeometry, tipMaterial);
      tip.position.copy(end);
      tip.quaternion.setFromUnitVectors(UP, end.clone().sub(from).normalize());
      backupLayer.add(tip);
      const pulse = new Mesh(pulseGeometry, tipMaterial);
      backupLayer.add(pulse);
      backupPulses.push({ from, to: end, mesh: pulse });
    });
  }

  // --- Lavori in corso: impalcature trasparenti sul retro delle piattaforme --------------------
  const wipLayer = new Group();
  root.add(wipLayer);
  const scaffoldGeometry = own(new BoxGeometry(0.6, 0.8, 0.45));
  const scaffoldEdges = own(new EdgesGeometry(scaffoldGeometry));
  const SCAFFOLD_FILL = 0.14;
  const SCAFFOLD_LINES = 0.75;
  const scaffoldMaterial = own(
    new MeshBasicMaterial({
      color: colors.wip,
      transparent: true,
      opacity: SCAFFOLD_FILL,
      depthWrite: false,
    }),
  );
  const scaffoldLines = own(
    new LineBasicMaterial({ color: colors.wip, transparent: true, opacity: SCAFFOLD_LINES }),
  );
  for (const region of model.regions) {
    const x = regionX.get(region.id) ?? 0;
    region.wip.forEach((_, k) => {
      const box = new Mesh(scaffoldGeometry, scaffoldMaterial);
      box.position.set(
        x + 0.55 + (k - (region.wip.length - 1) / 2) * 0.8,
        PLATFORM_TOP + 0.4,
        -1.2,
      );
      box.add(new LineSegments(scaffoldEdges, scaffoldLines));
      wipLayer.add(box);
    });
  }

  // --- Failover: anello del VIP sopra il nodo che risponde -------------------------------------
  const vipMaterial = own(new MeshBasicMaterial({ color: colors.vip }));
  const vip = new Mesh(own(new TorusGeometry(0.34, 0.035, 6, 24)), vipMaterial);
  vip.rotation.x = Math.PI / 2;
  const vipPrimary = rackTop(model.failover?.primary.node, 0.22);
  const vipBackup = rackTop(model.failover?.backup.node, 0.22);
  const vipGoal = vipPrimary.clone();
  vip.position.copy(vipGoal);
  vip.visible = model.failover !== undefined;
  root.add(vip);

  // --- Simulazione: metriche e log con seme (nessuna rete) -------------------------------------
  const nodeIds = model.regions.flatMap((r) => r.nodes.map((n) => n.id));
  const serviceNode = new Map(
    model.regions.flatMap((r) => r.nodes.flatMap((n) => n.services.map((s) => [s.id, n] as const))),
  );
  const sim = createSimulator({
    nodeIds,
    seed: model.simulation.seed,
    startMinute: SIM_START_MINUTE,
    templates: model.simulation.logs,
  });

  // --- Momenti del racconto ---------------------------------------------------------------------
  const allNodes = model.regions.flatMap((r) => r.nodes);
  const centroid = (ids: readonly string[], y: number): Vector3 => {
    const points = ids.map((id) => nodes.get(id)?.base).filter((p): p is Vector3 => !!p);
    const sum = points.reduce((acc, p) => acc.add(p), new Vector3());
    return points.length ? sum.divideScalar(points.length).setY(y) : new Vector3(0, y, 0);
  };
  const adrNodes = new Set(allNodes.filter((n) => n.adrs.length > 0).map((n) => n.id));
  const failoverPair = model.failover
    ? [model.failover.primary.node, model.failover.backup.node]
    : [];
  const span = REGION_GAP * (model.regions.length - 1);

  // Stato dei comandi della prima schermata (il momento d'insieme li rispetta).
  let selected: string | null = null;
  const layers = { decisions: false, backup: false, wip: true };
  let failing = false;

  /** Inquadratura del momento `name`; `local` = distanza dal momento (-1..1) per i movimenti interni. */
  const pose = (name: string | undefined, local: number): Pose => {
    const card = { yaw: 0, elevation: 0.42, distance: 1, shift: 0.2, decisions: 0, backup: 0 };
    const none = { wip: 0, failover: 0 };
    switch (name) {
      case 'nodes':
        // Panoramica lenta lungo la fila dei nodi mentre la scheda attraversa lo schermo.
        return {
          ...card,
          ...none,
          target: new Vector3(Math.max(-0.5, Math.min(0.5, local)) * span * 0.9, 0.75, NODE_Z),
          yaw: 0.18,
          elevation: 0.26,
          distance: 0.55,
        };
      case 'decisions':
        return {
          ...card,
          ...none,
          target: centroid([...adrNodes], 0.95),
          yaw: -0.22,
          elevation: 0.36,
          // Schermo largo: la scheda e a sinistra, le due piattaforme devono stare nel resto (PORT-85).
          distance: size.width >= size.height ? 1.45 : 0.72,
          shift: size.width >= size.height ? 0.26 : 0.3,
          decisions: 1,
        };
      case 'failover':
        // Il primario cade mentre la scheda arriva al centro: il VIP passa al backup.
        return {
          ...card,
          wip: 0,
          // Piu vicino al primario: e lui che cade, il VIP arriva da destra.
          target: rackTop(failoverPair[0], 0).lerp(rackTop(failoverPair[1], 0), 0.4).setY(0.95),
          elevation: 0.38,
          distance: 0.95,
          shift: 0.3,
          failover: ease((local + 0.45) / 0.5),
        };
      case 'backup':
        return {
          ...card,
          ...none,
          target: new Vector3(0, 1.15, -0.4),
          elevation: 0.5,
          distance: 1.2,
          backup: 1,
        };
      case 'wip':
        return {
          ...card,
          // Dall'alto, oltre i rack: le impalcature sul retro, piu marcate (peso 2).
          target: new Vector3(0, 0.45, -0.9),
          yaw: 0.35,
          elevation: 0.72,
          distance: 0.8,
          shift: 0.25,
          wip: 2,
          failover: 0,
        };
      case 'projects':
        return { ...card, ...none, target: new Vector3(0, 0.45, 0), distance: 1.05 };
      default:
        // Prima schermata: vista d'insieme, comandi dell'utente, soggetto a sinistra dei comandi.
        return {
          target: new Vector3(0, 0.45, 0),
          yaw: userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude,
          elevation: 0.46,
          // Con la colonna dei comandi a destra (PORT-85) entrambe le piattaforme restano a sinistra.
          distance: sideControls ? SIDE_CONTROLS.distance : 1,
          shift: sideControls ? SIDE_CONTROLS.shift : -0.12,
          decisions: layers.decisions ? 1 : 0,
          backup: layers.backup ? 1 : 0,
          wip: layers.wip ? 1 : 0,
          failover: failing ? 1 : 0,
        };
    }
  };

  // --- Stato ------------------------------------------------------------------------------------
  let userYaw: number | null = null;
  let elapsed = 0;
  let sinceSim = 0;
  let storyTarget = 0;
  let story = 0;
  let interactive = true;
  let baseDistance = 10;
  let size = { width: 1, height: 1 };
  /** Da 72rem i comandi stanno in una colonna a destra (stessa soglia del CSS di /human). */
  let sideControls = false;
  const eye = new Vector3();

  const place = (dt: number): void => {
    const { from, to, t } = blendAt(story, Math.max(1, moments.length));
    const a = pose(moments[from], story - from);
    const b = pose(moments[to], story - to);
    const at = (key: keyof Omit<Pose, 'target'>) => mix(a[key], b[key], t);

    // Camera in orbita attorno al soggetto del momento.
    const target = a.target.lerp(b.target, t);
    const yaw = at('yaw');
    const elevation = at('elevation');
    const distance = at('distance') * baseDistance;
    eye.set(
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    );
    camera.position.copy(target).addScaledVector(eye, distance);
    camera.lookAt(target);
    // Schermo largo: soggetto a destra delle schede (a sinistra dei comandi nella prima schermata).
    // Schermo stretto: soggetto piu in alto, sopra la barra dei comandi e le schede.
    const shift = at('shift');
    const wide = size.width >= size.height;
    camera.setViewOffset(
      size.width,
      size.height,
      wide ? -shift * size.width * 0.5 : 0,
      wide ? 0 : Math.abs(shift) * size.height * 1.2,
      size.width,
      size.height,
    );

    // Layer: pesi continui, cosi passano in dissolvenza da un momento all'altro.
    const decisions = at('decisions');
    for (const [id, view] of nodes) {
      const glow = adrNodes.has(id) ? decisions : 0;
      view.rack.setGlow(glow);
      if (view.marker) {
        view.marker.visible = glow > 0.01;
        view.marker.scale.setScalar(Math.max(0.01, glow));
        view.marker.rotation.y = elapsed * 0.8;
      }
      view.rack.setSelected(interactive && id === selected);
      view.rack.blink(elapsed);
    }
    const backup = at('backup');
    backupLayer.visible = backup > 0.01;
    for (const material of backupMaterials) material.opacity = backup;
    const wip = at('wip');
    wipLayer.visible = wip > 0.01;
    // Oltre 1 il layer e il protagonista del momento: riempimento e spigoli piu evidenti.
    scaffoldMaterial.opacity = SCAFFOLD_FILL * Math.min(1, wip) + 0.16 * Math.max(0, wip - 1);
    scaffoldLines.opacity = Math.min(1, SCAFFOLD_LINES * wip);

    // Il VIP scivola verso il nodo che risponde; a scena ferma arriva subito.
    const failover = at('failover');
    vipGoal.lerpVectors(vipPrimary, vipBackup, failover);
    if (dt === 0) vip.position.copy(vipGoal);
    else vip.position.lerp(vipGoal, Math.min(1, dt * VIP_SPEED));
    vip.rotation.z = elapsed * 0.6;
    const primary = model.failover ? nodes.get(model.failover.primary.node) : undefined;
    primary?.rack.setDown(failover > 0.5);

    for (const beam of beams) {
      beam.pulses.forEach((pulse, k) => {
        const s = (elapsed * 0.35 + k / PULSES) % 1;
        pulse.position.set(beam.from + (beam.to - beam.from) * s, BEAM_Y, 0);
      });
    }
    backupPulses.forEach((p, k) => {
      p.mesh.position.lerpVectors(p.from, p.to, (elapsed * 0.45 + k / 3) % 1);
    });
  };

  const logLine = (line: LogLine): void => {
    const node = serviceNode.get(line.service);
    const service = node?.services.find((s) => s.id === line.service);
    if (node) ui.log(node.id, line, service?.name ?? line.service);
  };
  const simulate = (): void => {
    const result = sim.tick();
    ui.metrics(result.metrics, (id) => sim.history(id, SPARK_POINTS));
    if (result.log) logLine(result.log);
  };

  // --- Ciclo di disegno -------------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let disposed = false;
  const draw = (dt = 0): void => {
    place(dt);
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
    const gap = storyTarget - story;
    story = Math.abs(gap) < 0.001 ? storyTarget : story + gap * Math.min(1, dt * STORY_CATCH_UP);
    // Metriche e log avanzano solo mentre la scena anima: fuori schermo o fermi, restano fermi.
    sinceSim += dt;
    if (sinceSim >= SIM_EVERY) {
      sinceSim = 0;
      simulate();
    }
    draw(dt);
    frame = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };

  // --- Interfaccia HTML -------------------------------------------------------------------------
  const nodeName = (id: string | undefined) => allNodes.find((n) => n.id === id)?.name ?? '';
  const ui = bindHomelabUi(container, {
    select(nodeId) {
      selected = nodeId;
      invalidate();
    },
    layer(name, on) {
      layers[name] = on;
      invalidate();
    },
    failover(on) {
      const pair = model.failover;
      if (!pair) return '';
      failing = on;
      if (on) sim.shiftLoad(pair.primary.node, pair.backup.node);
      else sim.restoreLoad();
      for (const line of on ? model.simulation.failover.down : model.simulation.failover.up)
        logLine(sim.push(line));
      simulate();
      invalidate();
      return nodeName(on ? pair.backup.node : pair.primary.node);
    },
  });
  if (model.failover) ui.failoverStatus(nodeName(model.failover.primary.node), false);
  // Primo quadro: anche a scena ferma il pannello mostra valori e un po' di storico.
  simulate();

  // --- Puntatore: orbit orizzontale e selezione (solo nella prima schermata) --------------------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hits = [...nodes.values()].map((v) => v.rack.hit);
  const pick = (x: number, y: number): string | null => {
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(hits, false)[0];
    return (hit?.object.userData.nodeId as string | undefined) ?? null;
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
    // Distanza d'insieme: entrambe le piattaforme nel riquadro, anche su schermi stretti.
    // In verticale si stringe il margine: meglio piattaforme grandi che tanto vuoto intorno.
    const width = span + PLATFORM_RADIUS * (aspect < 1 ? 2.1 : 2.6);
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    baseDistance = Math.max(width / 2 / Math.tan(horizontal), 6) + 1.5;
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
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      size = { width, height };
      sideControls = width >= SIDE_CONTROLS.minWidth;
      camera.aspect = width / height;
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
