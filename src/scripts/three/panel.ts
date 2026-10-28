/*
 * Elenco + pannello HTML accanto a una scena 3D (spec §12): un pulsante per elemento
 * (`[data-panel-open]`) apre il blocco corrispondente (`[data-panel-item]`) nel pannello.
 * Elementi veri: tastiera, focus sul titolo all'apertura, Esc chiude e riporta il focus al pulsante.
 * I controlli sono nascosti finche la scena non e montata: senza 3D resta il testo della sezione.
 * Nessuna dipendenza da three.
 */

export interface PanelHooks {
  /** Elemento evidenziato nella scena; `null` = nessuno. */
  select(id: string | null): void;
}

export interface PanelUi {
  /** Click su un elemento nel canvas (o sul vuoto, `null`). */
  selectFromScene(id: string | null): void;
  /** Nasconde di nuovo i controlli e rimuove gli ascoltatori. */
  dispose(): void;
}

export function bindPanelUi(container: HTMLElement, hooks: PanelHooks): PanelUi {
  const root = container.closest('section')?.querySelector<HTMLElement>('[data-panel-ui]');
  if (!root) return { selectFromScene: () => {}, dispose: () => {} };

  const panel = root.querySelector<HTMLElement>('[data-panel]');
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-panel-open]')];
  const items = [...root.querySelectorAll<HTMLElement>('[data-panel-item]')];
  const closeButton = root.querySelector<HTMLButtonElement>('[data-panel-close]');

  let open: string | null = null;

  const show = (id: string | null): void => {
    open = id;
    for (const b of buttons) b.setAttribute('aria-expanded', String(b.dataset.panelOpen === id));
    for (const item of items) item.hidden = item.dataset.panelItem !== id;
    if (panel) panel.hidden = id === null;
    hooks.select(id);
  };

  const openItem = (id: string): void => {
    show(id);
    // Il focus va al titolo del pannello: chi usa uno screen reader sente subito cosa si e aperto.
    items
      .find((item) => item.dataset.panelItem === id)
      ?.querySelector<HTMLElement>('[data-panel-heading]')
      ?.focus();
  };

  const close = (): void => {
    if (open === null) return;
    const opener = buttons.find((b) => b.dataset.panelOpen === open);
    show(null);
    opener?.focus();
  };

  const onClick = (event: Event): void => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.panelOpen;
    if (!id) return;
    if (id === open) close();
    else openItem(id);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || open === null) return;
    event.preventDefault();
    close();
  };

  for (const b of buttons) b.addEventListener('click', onClick);
  closeButton?.addEventListener('click', close);
  root.addEventListener('keydown', onKey);
  root.hidden = false;

  return {
    selectFromScene(id) {
      if (id === null || id === open) close();
      else openItem(id);
    },
    dispose() {
      show(null);
      for (const b of buttons) b.removeEventListener('click', onClick);
      closeButton?.removeEventListener('click', close);
      root.removeEventListener('keydown', onKey);
      root.hidden = true;
    },
  };
}
