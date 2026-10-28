import { bindPanelUi } from '../panel';
import type { LogLine, MetricSample } from './metrics';

/*
 * Controlli HTML della scena Homelab (spec §12.1), sopra l'elenco + pannello comune (../panel.ts):
 * layer attivabili, gesto "provoca failover DNS" con stato annunciato (role="status"), metriche e
 * log simulati nel pannello del nodo. Elementi veri, resi da human.astro e nascosti finche la scena
 * non e montata. Nessuna dipendenza da three.
 */

export type HomelabLayer = 'decisions' | 'backup' | 'wip';
const layerNames: readonly HomelabLayer[] = ['decisions', 'backup', 'wip'];
const isLayer = (value: string | undefined): value is HomelabLayer =>
  layerNames.includes(value as HomelabLayer);

const metricKeys = ['cpu', 'ram', 'net'] as const;
/** Righe di log visibili per nodo: abbastanza per vederle scorrere, non per farne un muro. */
const LOG_LINES = 6;

export interface HomelabUiHooks {
  /** Nodo evidenziato nella scena; `null` = nessuno. */
  select(nodeId: string | null): void;
  layer(name: HomelabLayer, on: boolean): void;
  /** Avvia o annulla il guasto simulato; restituisce il nome del nodo che ora ha il VIP. */
  failover(on: boolean): string;
}

export interface HomelabUi {
  /** Click su un nodo nel canvas (o sul vuoto, `null`). */
  selectFromScene(nodeId: string | null): void;
  /** Valori correnti e storico (per le sparkline) di ogni nodo. */
  metrics(values: Record<string, MetricSample>, history: (nodeId: string) => MetricSample[]): void;
  /** Nuova riga di log nel pannello del nodo che ospita il servizio. */
  log(nodeId: string, line: LogLine, serviceName: string): void;
  /** Stato del gesto: nome del nodo con il VIP e se il guasto e in corso. */
  failoverStatus(nodeName: string, active: boolean): void;
  dispose(): void;
}

const sparkPoints = (values: number[], max: number): string =>
  values
    .map((v, i) => {
      const x = values.length > 1 ? (i / (values.length - 1)) * 60 : 0;
      const y = 16 - (Math.min(v, max) / max) * 15 - 0.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

export function bindHomelabUi(container: HTMLElement, hooks: HomelabUiHooks): HomelabUi {
  const panel = bindPanelUi(container, { select: hooks.select });
  const root = container.closest('section')?.querySelector<HTMLElement>('[data-panel-ui]');
  if (!root) return { ...panel, metrics() {}, log() {}, failoverStatus() {} };

  const layerButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-layer]')];
  const adrBlocks = [...root.querySelectorAll<HTMLElement>('[data-panel-adrs]')];
  const items = [...root.querySelectorAll<HTMLElement>('[data-panel-item]')];
  const failoverButton = root.querySelector<HTMLButtonElement>('[data-failover]');
  const status = root.querySelector<HTMLElement>('[data-failover-status]');

  const applyLayer = (button: HTMLButtonElement): void => {
    const name = button.dataset.layer;
    if (!isLayer(name)) return;
    const on = button.getAttribute('aria-pressed') === 'true';
    if (name === 'decisions') for (const block of adrBlocks) block.hidden = !on;
    hooks.layer(name, on);
  };
  const onLayerClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    applyLayer(button);
  };
  for (const button of layerButtons) {
    button.addEventListener('click', onLayerClick);
    applyLayer(button);
  }

  let failing = false;
  const failoverStatus = (nodeName: string, active: boolean): void => {
    failing = active;
    if (failoverButton) {
      failoverButton.textContent =
        (active ? failoverButton.dataset.stop : failoverButton.dataset.start) ?? '';
    }
    const template = (active ? status?.dataset.active : status?.dataset.normal) ?? '';
    if (status) status.textContent = template.replace('{node}', nodeName);
  };
  const onFailover = (): void => failoverStatus(hooks.failover(!failing), !failing);
  failoverButton?.addEventListener('click', onFailover);

  const blockOf = (nodeId: string) => items.find((item) => item.dataset.panelItem === nodeId);

  return {
    selectFromScene: panel.selectFromScene,
    metrics(values, history) {
      for (const [nodeId, sample] of Object.entries(values)) {
        const block = blockOf(nodeId);
        if (!block) continue;
        const past = history(nodeId);
        for (const key of metricKeys) {
          const value = block.querySelector<HTMLElement>(`[data-metric="${key}"]`);
          if (value) value.textContent = sample[key].toFixed(1);
          const line = block.querySelector(`[data-spark="${key}"] polyline`);
          // La rete non ha un tetto naturale: la scala segue il massimo recente.
          const max = key === 'net' ? Math.max(1, ...past.map((s) => s.net)) : 100;
          line?.setAttribute(
            'points',
            sparkPoints(
              past.map((s) => s[key]),
              max,
            ),
          );
        }
      }
    },
    log(nodeId, line, serviceName) {
      const list = blockOf(nodeId)?.querySelector('[data-log]');
      if (!list) return;
      const item = document.createElement('li');
      item.textContent = `${line.time} ${serviceName}: ${line.message}`;
      list.prepend(item);
      while (list.children.length > LOG_LINES) list.lastElementChild?.remove();
    },
    failoverStatus,
    dispose() {
      for (const button of layerButtons) button.removeEventListener('click', onLayerClick);
      failoverButton?.removeEventListener('click', onFailover);
      panel.dispose();
    },
  };
}
