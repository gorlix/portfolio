/*
 * Colori delle scene: SOLO token del tema (src/styles/theme.css), letti a runtime dal contenitore.
 * Nessun valore colore letterale nel codice 3D.
 */

/** Valore calcolato di un token CSS (`--nome`) sul contenitore; stringa vuota se assente. */
export function readToken(element: Element, name: `--${string}`): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/** Primo token definito tra quelli indicati, in ordine di preferenza. */
export function firstToken(element: Element, names: readonly `--${string}`[]): string {
  for (const name of names) {
    const value = readToken(element, name);
    if (value) return value;
  }
  return '';
}

/** Token d'accento della sezione (`--sec-<data-accent>`), con ripiego sul testo. */
export function accentToken(container: HTMLElement): string {
  const accent = container.dataset.accent;
  return firstToken(container, accent ? [`--sec-${accent}`, '--text'] : ['--text']);
}
