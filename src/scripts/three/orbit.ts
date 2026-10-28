/*
 * Orbit leggero delle scene di /human: solo rotazione orizzontale con il trascinamento, entro un
 * limite. Il canvas ha `touch-action: pan-y` (Scene.astro) e qui non c'e nessun ascoltatore della
 * rotella: lo scroll verticale resta sempre della pagina. Un tocco senza trascinamento e un click.
 * Nessuna dipendenza da three.
 */

/** Sotto questa distanza un trascinamento e ancora un click. */
const CLICK_SLOP_PX = 6;
const YAW_PER_PX = 0.006;

export interface OrbitOptions {
  /** Rotazione massima, in radianti, a destra e a sinistra. */
  maxYaw: number;
  /** Rotazione corrente, letta all'inizio di ogni trascinamento. */
  yaw(): number;
  /** Nuova rotazione chiesta dall'utente. */
  onYaw(yaw: number): void;
  /** Click o tocco senza trascinamento, in coordinate normalizzate (-1..1, y verso l'alto). */
  onClick(x: number, y: number): void;
  /** Movimento del mouse senza tasti premuti, per il cursore sugli elementi cliccabili. */
  onHover?(x: number, y: number): void;
}

export function attachOrbit(canvas: HTMLCanvasElement, options: OrbitOptions): () => void {
  const normalized = (event: PointerEvent): [number, number] | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ];
  };

  let drag: { id: number; x: number; y: number; yaw: number; moved: boolean } | null = null;

  const onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: options.yaw(),
      moved: false,
    };
  };
  const onMove = (event: PointerEvent): void => {
    if (!drag || drag.id !== event.pointerId) {
      const point = event.pointerType === 'mouse' ? normalized(event) : null;
      if (point) options.onHover?.(...point);
      return;
    }
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.hypot(dx, event.clientY - drag.y) < CLICK_SLOP_PX) return;
    if (!drag.moved) canvas.setPointerCapture(event.pointerId);
    drag.moved = true;
    const limit = options.maxYaw;
    options.onYaw(Math.max(-limit, Math.min(limit, drag.yaw + dx * YAW_PER_PX)));
  };
  const onUp = (event: PointerEvent): void => {
    if (!drag || drag.id !== event.pointerId) return;
    const wasClick = !drag.moved;
    drag = null;
    const point = wasClick ? normalized(event) : null;
    if (point) options.onClick(...point);
  };
  // Il browser si e preso il gesto (scroll verticale): nessuna rotazione, nessun click.
  const onCancel = (): void => {
    drag = null;
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
  };
}
