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
import { createSimulator, type LogLine } from '../homelab/metrics';
import { bindHomelabUi } from '../homelab/ui';
import { attachOrbit } from '../orbit';
import { firstToken } from '../tokens';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Scena Homelab (spec §12.1, §7.3): due piattaforme low-poly (Casa e Produzione), i nodi generati
 * dai dati e un fascio di luce che le unisce (la rete overlay). Tutto procedurale, nessun modello
 * esterno. I dati sono gli stessi della tabella testuale (src/lib/homelab.ts); pannelli e controlli
 * sono HTML veri, gestiti da ../homelab/ui.ts.
 * Orbit leggero solo in orizzontale (../orbit.ts): lo scroll della pagina non viene mai catturato.
 * Metriche e log sono simulati con un seme (../homelab/metrics.ts) e avanzano solo mentre la scena
 * anima; il gesto di failover sposta il VIP, il carico e i log sul nodo di backup.
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
/** Oscillazione lenta finche l'utente non prende il controllo. */
const SWAY = { amplitude: 0.22, speed: 0.18 };

/** Secondi reali tra un passo della simulazione e il successivo, e punti delle sparkline. */
const SIM_EVERY = 1.2;
const SPARK_POINTS = 30;
/** Ora simulata d'inizio: sera, quando l'homelab lavora di piu. */
const SIM_START_MINUTE = 19 * 60;
const VIP_SPEED = 3;
const UP = new Vector3(0, 1, 0);

export function mount({ canvas, container, tier, profile, data }: SceneContext): SceneInstance {
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
    danger: tint(['--danger', '--ctp-red']),
    vip: tint(['--ctp-teal', '--sec-homelab']),
    backup: tint(['--ctp-sky', '--sec-homelab']),
    cloud: tint(['--ctp-lavender', '--surface-hi']),
    wip: tint(['--ctp-peach', '--text']),
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

  // --- Layer Backup 3-2-1: frecce dal nodo d'origine verso i tre destinatari ------------------
  const backupLayer = new Group();
  backupLayer.visible = false;
  root.add(backupLayer);
  const arrowMaterial = own(new LineBasicMaterial({ color: colors.backup }));
  const tipGeometry = own(new ConeGeometry(0.07, 0.2, 6));
  const tipMaterial = own(new MeshBasicMaterial({ color: colors.backup }));
  const cloudGeometry = own(new IcosahedronGeometry(0.22, 0));
  const cloudMaterial = own(
    new MeshStandardMaterial({ color: colors.cloud, flatShading: true, roughness: 0.8 }),
  );
  const diskGeometry = own(new CylinderGeometry(0.28, 0.28, 0.12, 8));
  const backupPulses: { from: Vector3; to: Vector3; mesh: Mesh }[] = [];
  const sourceView = nodes.get(model.backup.source.node);
  if (sourceView) {
    const from = sourceView.body.position.clone().setY(PLATFORM_TOP + NODE_SIZE.h + 0.1);
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
  const scaffoldMaterial = own(
    new MeshBasicMaterial({
      color: colors.wip,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  const scaffoldLines = own(
    new LineBasicMaterial({ color: colors.wip, transparent: true, opacity: 0.75 }),
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
  const vipAt = (nodeId: string | undefined) =>
    (nodeId ? nodes.get(nodeId)?.body.position.clone() : undefined)?.setY(
      PLATFORM_TOP + NODE_SIZE.h + 0.22,
    ) ?? new Vector3();
  const vipTarget = vipAt(model.failover?.primary.node);
  vip.position.copy(vipTarget);
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

  // --- Stato ------------------------------------------------------------------------------------
  let selected: string | null = null;
  let decisions = false;
  let failing = false;
  let yaw = 0;
  let userYaw: number | null = null;
  let elapsed = 0;
  let sinceSim = 0;

  const paint = (): void => {
    for (const [id, view] of nodes) {
      const on = id === selected;
      view.body.material.color.copy(on ? colors.selected : colors.node);
      view.body.material.emissive.copy(on ? colors.selected : colors.platform);
      view.body.material.emissiveIntensity = on ? 0.25 : 0;
      if (view.marker) view.marker.visible = decisions;
      const down = failing && id === model.failover?.primary.node;
      view.leds.color.copy(down ? colors.danger : colors.led);
    }
  };

  const place = (dt: number): void => {
    root.rotation.y = yaw;
    for (const beam of beams) {
      beam.pulses.forEach((pulse, k) => {
        const t = (elapsed * 0.35 + k / PULSES) % 1;
        pulse.position.set(beam.from + (beam.to - beam.from) * t, BEAM_Y, 0);
      });
    }
    backupPulses.forEach((p, k) => {
      p.mesh.position.lerpVectors(p.from, p.to, (elapsed * 0.45 + k / 3) % 1);
    });
    for (const view of nodes.values()) {
      if (!view.marker) continue;
      view.marker.rotation.y = elapsed * 0.8;
    }
    // Il VIP scivola verso il nodo che risponde; a scena ferma arriva subito.
    if (dt === 0) vip.position.copy(vipTarget);
    else vip.position.lerp(vipTarget, Math.min(1, dt * VIP_SPEED));
    vip.rotation.z = elapsed * 0.6;
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
    yaw = userYaw ?? Math.sin(elapsed * SWAY.speed) * SWAY.amplitude;
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
  const nodeName = (id: string | undefined) =>
    model.regions.flatMap((r) => r.nodes).find((n) => n.id === id)?.name ?? '';
  const ui = bindHomelabUi(container, {
    select(nodeId) {
      selected = nodeId;
      paint();
      invalidate();
    },
    layer(name, on) {
      if (name === 'decisions') decisions = on;
      if (name === 'backup') backupLayer.visible = on;
      if (name === 'wip') wipLayer.visible = on;
      paint();
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
      vipTarget.copy(vipAt(on ? pair.backup.node : pair.primary.node));
      simulate();
      paint();
      invalidate();
      return nodeName(on ? pair.backup.node : pair.primary.node);
    },
  });
  if (model.failover) ui.failoverStatus(nodeName(model.failover.primary.node), false);
  // Primo quadro: anche a scena ferma il pannello mostra valori e un po' di storico.
  simulate();

  // --- Puntatore: orbit orizzontale e selezione -------------------------------------------------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const bodies = [...nodes.values()].map((v) => v.body);
  const pick = (x: number, y: number): string | null => {
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(bodies, false)[0];
    return (hit?.object.userData.nodeId as string | undefined) ?? null;
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
    // La camera arretra finche entrambe le piattaforme stanno nel riquadro, anche su schermi stretti.
    const width = REGION_GAP * (model.regions.length - 1) + PLATFORM_RADIUS * 2.6;
    const vertical = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const distance = Math.max(width / 2 / Math.tan(horizontal), 6) + 1.5;
    camera.position.copy(target).add(new Vector3(0, 0.5, 1).normalize().multiplyScalar(distance));
    camera.lookAt(target);
  };

  paint();

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
      detachOrbit();
      for (const resource of owned) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
