/*
 * Popup sugli oggetti della scrivania (Home di /human, PORT-84). Schede HTML vere (testo e link
 * nel markup di human.astro, dai dati YAML), una per oggetto: si aprono col mouse sopra l'oggetto,
 * con un tocco o dal pulsante equivalente dell'elenco (tastiera). Esc chiude e riporta il focus al
 * pulsante. Il popup resta aperto mentre il mouse ci passa sopra, cosi il link si puo cliccare.
 * Nessuna dipendenza da three: la scena decide cosa c'e sotto il puntatore e dove sta l'oggetto.
 */

/** Pausa prima di chiudere un popup aperto dal passaggio del mouse (tempo per raggiungerlo). */
const CLOSE_DELAY_MS = 280;
const GAP = 12;
const MARGIN = 8;

export interface Point {
  x: number;
  y: number;
}

export interface Placement {
  left: number;
  top: number;
}

/**
 * Posizione del popup (angolo in alto a sinistra) rispetto all'area `bounds`: sopra il punto,
 * centrato, o sotto se sopra non c'e posto; sempre dentro i margini.
 */
export function placePopup(
  anchor: Point,
  size: { width: number; height: number },
  bounds: { width: number; height: number },
): Placement {
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(value, Math.max(min, max)));
  const left = clamp(anchor.x - size.width / 2, MARGIN, bounds.width - size.width - MARGIN);
  const above = anchor.y - size.height - GAP;
  const top = above >= MARGIN ? above : anchor.y + GAP;
  return { left, top: clamp(top, MARGIN, bounds.height - size.height - MARGIN) };
}

export interface HardwareHooks {
  /** Posizione dell'oggetto in pixel CSS rispetto al canvas; `null` se non e visibile. */
  anchor(id: string): Point | null;
}

export interface HardwareUi {
  /** Mouse sopra un oggetto (o sul vuoto, `null`): apre e, uscendo, chiude dopo una breve pausa. */
  hover(id: string | null): void;
  /** Tocco o click su un oggetto (o sul vuoto, `null`): apre fisso, o chiude. */
  tap(id: string | null): void;
  /** Ricalcola la posizione del popup aperto (camera mossa, ridimensionamento). */
  reposition(): void;
  /** Solo nella prima schermata: fuori, il popup si chiude e i pulsanti non sono attivi. */
  setActive(active: boolean): void;
  isOpen(): boolean;
  dispose(): void;
}

const noop: HardwareUi = {
  hover() {},
  tap() {},
  reposition() {},
  setActive() {},
  isOpen: () => false,
  dispose() {},
};

export function bindHardwareUi(container: HTMLElement, hooks: HardwareHooks): HardwareUi {
  const section = container.closest('section');
  const root = section?.querySelector<HTMLElement>('[data-hw-ui]');
  const layer = section?.querySelector<HTMLElement>('[data-hw-layer]');
  if (!section || !root || !layer) return noop;

  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-hw-open]')];
  const popups = [...layer.querySelectorAll<HTMLElement>('[data-hw-pop]')];
  // Con il 3D attivo i controlli sostituiscono l'elenco di testo, che resta solo come ripiego.
  const text = section.querySelector<HTMLElement>('[data-hw-text]');

  let open: string | null = null;
  let pinned = false;
  let active = true;
  let timer = 0;

  const popupOf = (id: string | null) => popups.find((p) => p.dataset.hwPop === id);
  const cancelTimer = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };

  const reposition = (): void => {
    const popup = popupOf(open);
    const canvas = container.querySelector('canvas');
    if (!popup || !open || !canvas) return;
    const anchor = hooks.anchor(open);
    if (!anchor) {
      popup.style.visibility = 'hidden';
      return;
    }
    const layerBox = layer.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const placed = placePopup(
      { x: anchor.x + canvasBox.left - layerBox.left, y: anchor.y + canvasBox.top - layerBox.top },
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: layerBox.width, height: layerBox.height },
    );
    popup.style.left = `${Math.round(placed.left)}px`;
    popup.style.top = `${Math.round(placed.top)}px`;
    popup.style.visibility = '';
  };

  const show = (id: string | null, fix: boolean): void => {
    cancelTimer();
    open = id;
    pinned = id !== null && fix;
    for (const b of buttons) b.setAttribute('aria-expanded', String(b.dataset.hwOpen === id));
    for (const p of popups) p.hidden = p.dataset.hwPop !== id;
    reposition();
  };

  const closeAndRestoreFocus = (): void => {
    const opener = buttons.find((b) => b.dataset.hwOpen === open);
    const hadFocus = layer.contains(document.activeElement);
    show(null, false);
    if (hadFocus) opener?.focus();
  };

  const scheduleClose = (): void => {
    if (open === null || pinned || timer) return;
    timer = window.setTimeout(() => show(null, false), CLOSE_DELAY_MS);
  };

  const onButton = (event: Event): void => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.hwOpen ?? null;
    if (!active || id === null) return;
    if (id === open && pinned) {
      show(null, false);
      return;
    }
    show(id, true);
    // Il focus passa al titolo del popup: chi usa uno screen reader sente cosa si e aperto,
    // e il link e il Tab successivo.
    popupOf(id)?.querySelector<HTMLElement>('[data-hw-heading]')?.focus();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || open === null) return;
    event.preventDefault();
    closeAndRestoreFocus();
  };
  const onPopupEnter = (): void => cancelTimer();
  const onPopupLeave = (): void => scheduleClose();
  // Entrando nel popup con la tastiera il popup diventa fisso.
  const onPopupFocus = (): void => {
    pinned = true;
    cancelTimer();
  };

  for (const b of buttons) b.addEventListener('click', onButton);
  for (const p of popups) {
    p.addEventListener('pointerenter', onPopupEnter);
    p.addEventListener('pointerleave', onPopupLeave);
    p.addEventListener('focusin', onPopupFocus);
  }
  document.addEventListener('keydown', onKey);
  root.hidden = false;
  if (text) text.hidden = true;

  return {
    hover(id) {
      if (!active || pinned) return;
      if (id === null) scheduleClose();
      else if (id !== open) show(id, false);
      else cancelTimer();
    },
    tap(id) {
      if (!active) return;
      if (id === null || (id === open && pinned)) show(null, false);
      else show(id, true);
    },
    reposition,
    setActive(next) {
      if (next === active) return;
      active = next;
      for (const b of buttons) b.disabled = !next;
      if (!next) show(null, false);
    },
    isOpen: () => open !== null,
    dispose() {
      show(null, false);
      for (const b of buttons) b.removeEventListener('click', onButton);
      for (const p of popups) {
        p.removeEventListener('pointerenter', onPopupEnter);
        p.removeEventListener('pointerleave', onPopupLeave);
        p.removeEventListener('focusin', onPopupFocus);
      }
      document.removeEventListener('keydown', onKey);
      root.hidden = true;
      if (text) text.hidden = false;
    },
  };
}
