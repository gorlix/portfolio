import {
  keyAction,
  nextBuffer,
  parseLangCommand,
  rememberedRedirect,
  step,
} from './terminal-logic';

/*
 * Miglioramento progressivo del terminale d'ingresso (PORT-18). Il testo e i link sono gia nell'HTML:
 * senza questo script la pagina e identica nei contenuti. Qui si aggiungono solo digitazione,
 * tastiera, comando `lang` e lingua ricordata (localStorage, mai cookie).
 */

const STORAGE_KEY = 'lang';
const CHAR_DELAY_MS = 22;
const LINE_DELAY_MS = 180;
const COMMAND_TIMEOUT_MS = 3000;

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const store = (locale: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage non disponibile (finestra privata, blocco dati): la preferenza non si ricorda.
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface TypedLine {
  full: string[];
  typed: HTMLElement;
  rest: HTMLElement;
}

/**
 * Sostituisce il testo di una riga con due span contigui (scritto / ancora da scrivere, nascosto
 * ma presente nel layout) per non spostare nulla durante la digitazione. Il testo completo resta
 * disponibile alle tecnologie assistive in una copia visivamente nascosta.
 */
function prepare(el: HTMLElement): TypedLine {
  const text = el.textContent ?? '';
  const reader = document.createElement('span');
  reader.className = 'sr-only';
  reader.textContent = text;
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  const typed = document.createElement('span');
  const rest = document.createElement('span');
  rest.className = 'rest';
  rest.textContent = text;
  visual.append(typed, rest);
  el.replaceChildren(reader, visual);
  return { full: Array.from(text), typed, rest };
}

function init(root: HTMLElement): void {
  const current = document.documentElement.lang;
  const langLinks = new Map<string, HTMLAnchorElement>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[hreflang]'))
    langLinks.set(a.hreflang, a);
  const locales = [...langLinks.keys()].filter((l) => l !== 'x-default');

  const redirect = rememberedRedirect(
    readStored(),
    current,
    root.dataset.defaultLocale ?? '',
    locales,
  );
  const redirectLink = redirect ? langLinks.get(redirect) : undefined;
  if (redirectLink) {
    location.replace(redirectLink.href);
    return;
  }
  for (const [locale, a] of langLinks) a.addEventListener('click', () => store(locale));

  for (const hint of root.querySelectorAll<HTMLElement>('[data-hint]')) hint.hidden = false;

  const choices = [...root.querySelectorAll<HTMLAnchorElement>('[data-choices] a')];
  const choiceList = root.querySelector<HTMLElement>('[data-choices]');
  const skip = root.querySelector<HTMLButtonElement>('[data-skip]');

  let lines: TypedLine[] = [];
  let skipped = false;
  let buffer = '';
  let lastKey = 0;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      return;
    const now = Date.now();
    if (now - lastKey > COMMAND_TIMEOUT_MS) buffer = '';
    lastKey = now;

    if (e.key === 'Escape') finish();
    if (e.key === 'Enter') {
      const target = parseLangCommand(buffer, current, locales);
      buffer = '';
      const link = target ? langLinks.get(target) : undefined;
      if (link) {
        e.preventDefault();
        store(link.hreflang);
        location.assign(link.href);
      }
      return;
    }
    const action = keyAction(e.key, choices.length);
    if (action.type === 'pick') {
      e.preventDefault();
      location.assign(choices[action.index]?.href ?? '');
    } else if (action.type === 'move' && choices.length > 0) {
      e.preventDefault();
      finish();
      const at = choices.indexOf(document.activeElement as HTMLAnchorElement);
      const from = at === -1 ? (action.delta === 1 ? -1 : 0) : at;
      choices[step(from, action.delta, choices.length)]?.focus();
    }
    buffer = nextBuffer(buffer, e.key);
  });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  lines = [...root.querySelectorAll<HTMLElement>('[data-line]')].map(prepare);
  choiceList?.classList.add('pending');
  if (skip) {
    skip.hidden = false;
    skip.addEventListener('click', finish);
  }

  function finish(): void {
    if (skipped) return;
    skipped = true;
    for (const line of lines) {
      line.typed.textContent = line.full.join('');
      line.rest.textContent = '';
    }
    choiceList?.classList.remove('pending');
    if (skip) skip.hidden = true;
  }

  (async () => {
    for (const line of lines) {
      for (let i = 1; i <= line.full.length && !skipped; i++) {
        line.typed.textContent = line.full.slice(0, i).join('');
        line.rest.textContent = line.full.slice(i).join('');
        await sleep(CHAR_DELAY_MS);
      }
      if (skipped) return;
      await sleep(LINE_DELAY_MS);
    }
    finish();
  })();
}

const root = document.querySelector<HTMLElement>('[data-terminal]');
if (root) init(root);
