/*
 * Miglioramento progressivo della barra del tempo di /human (PORT-44). Il markup funziona gia
 * senza JS: qui si aggiungono tappa corrente, `#sezione` nell'URL e il menu su mobile.
 * Lo scroll non viene mai bloccato ne intercettato.
 */

const nav = document.querySelector<HTMLElement>('[data-timeline]');

if (nav && 'IntersectionObserver' in window) {
  nav.setAttribute('data-enhanced', '');
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const byId = new Map(links.map((a) => [a.getAttribute('href')?.slice(1) ?? '', a]));

  const mark = (ids: Set<string>): void => {
    for (const [id, link] of byId) {
      if (ids.has(id)) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  // Una tappa e "corrente" quando attraversa la linea di mezzo dello schermo.
  const sections = [...document.querySelectorAll<HTMLElement>('main section[id]')];
  const inMiddle = new Set<string>();
  let lastHash: string | undefined;

  const sync = (): void => {
    // Ultima sezione che attraversa la mezzeria (le sezioni sono in ordine di pagina).
    const current = sections.filter((s) => inMiddle.has(s.id)).at(-1);
    if (!current) return;
    const ids = new Set([current.id]);
    // Il sotto-segmento attivo, se la sezione ne ha.
    for (const sub of current.querySelectorAll<HTMLElement>('[id]')) {
      if (byId.has(sub.id) && sub.getBoundingClientRect().top < innerHeight / 2) {
        ids.clear();
        ids.add(current.id);
        ids.add(sub.id);
      }
    }
    mark(ids);
    // URL: `#sezione`, oppure nessun hash sulla Home; replaceState non crea voci di cronologia.
    const hash = current.id === sections[0]?.id ? '' : `#${current.id}`;
    if (hash !== lastHash && hash !== location.hash) {
      history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    }
    lastHash = hash;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inMiddle.add(e.target.id);
        else inMiddle.delete(e.target.id);
      }
      sync();
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  for (const s of sections) observer.observe(s);
  addEventListener('scroll', sync, { passive: true });

  // Menu su mobile: il pulsante apre l'elenco; Escape e un click su una tappa lo chiudono.
  const toggle = nav.querySelector<HTMLButtonElement>('.toggle');
  if (toggle) {
    toggle.hidden = false;
    const setOpen = (open: boolean): void => {
      nav.toggleAttribute('data-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!nav.hasAttribute('data-open')));
    nav.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a')) setOpen(false);
    });
    nav.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.hasAttribute('data-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }
}
