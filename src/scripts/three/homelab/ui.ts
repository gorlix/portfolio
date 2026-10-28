/*
 * Controlli HTML della scena Homelab (spec §12.1): elenco dei nodi, layer e pannello del nodo.
 * Sono elementi veri (tastiera, focus, Esc), resi da human.astro e nascosti finche la scena non e
 * montata: senza 3D resta l'equivalente testuale completo. Nessuna dipendenza da three.
 */

export type HomelabLayer = 'decisions';

export interface HomelabUiHooks {
  /** Nodo evidenziato nella scena; `null` = nessuno. */
  select(nodeId: string | null): void;
  layer(name: HomelabLayer, on: boolean): void;
}

export interface HomelabUi {
  /** Click su un nodo nel canvas (o sul vuoto, `null`). */
  selectFromScene(nodeId: string | null): void;
  /** Nasconde di nuovo i controlli e rimuove gli ascoltatori. */
  dispose(): void;
}

const isLayer = (value: string | undefined): value is HomelabLayer => value === 'decisions';

export function bindHomelabUi(container: HTMLElement, hooks: HomelabUiHooks): HomelabUi {
  const root = container.closest('section')?.querySelector<HTMLElement>('[data-homelab-ui]');
  if (!root) return { selectFromScene: () => {}, dispose: () => {} };

  const panel = root.querySelector<HTMLElement>('[data-panel]');
  const nodeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-node-button]')];
  const layerButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-layer]')];
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-panel-node]')];
  const adrBlocks = [...root.querySelectorAll<HTMLElement>('[data-panel-adrs]')];

  let open: string | null = null;

  const buttonOf = (id: string) => nodeButtons.find((b) => b.dataset.nodeButton === id);

  const show = (id: string | null): void => {
    open = id;
    for (const b of nodeButtons)
      b.setAttribute('aria-expanded', String(b.dataset.nodeButton === id));
    for (const block of blocks) block.hidden = block.dataset.panelNode !== id;
    if (panel) panel.hidden = id === null;
    hooks.select(id);
  };

  const openNode = (id: string): void => {
    show(id);
    // Il focus va al titolo del pannello: chi usa uno screen reader sente subito cosa si e aperto.
    blocks
      .find((b) => b.dataset.panelNode === id)
      ?.querySelector<HTMLElement>('[data-panel-heading]')
      ?.focus();
  };

  const close = (): void => {
    if (open === null) return;
    const opener = buttonOf(open);
    show(null);
    opener?.focus();
  };

  const onNodeClick = (event: Event): void => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.nodeButton;
    if (!id) return;
    if (id === open) close();
    else openNode(id);
  };

  const onLayerClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const name = button.dataset.layer;
    if (!isLayer(name)) return;
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    if (name === 'decisions') for (const block of adrBlocks) block.hidden = !on;
    hooks.layer(name, on);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || open === null) return;
    event.preventDefault();
    close();
  };

  const closeButton = root.querySelector<HTMLButtonElement>('[data-panel-close]');
  for (const b of nodeButtons) b.addEventListener('click', onNodeClick);
  for (const b of layerButtons) b.addEventListener('click', onLayerClick);
  closeButton?.addEventListener('click', close);
  root.addEventListener('keydown', onKey);
  root.hidden = false;

  return {
    selectFromScene(nodeId) {
      if (nodeId === null || nodeId === open) close();
      else openNode(nodeId);
    },
    dispose() {
      show(null);
      for (const b of nodeButtons) b.removeEventListener('click', onNodeClick);
      for (const b of layerButtons) b.removeEventListener('click', onLayerClick);
      closeButton?.removeEventListener('click', close);
      root.removeEventListener('keydown', onKey);
      root.hidden = true;
    },
  };
}
