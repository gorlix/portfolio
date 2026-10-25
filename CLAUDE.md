# CLAUDE.md — Portfolio Alessandro Gorla

Fonte di verità: `PORTFOLIO_SPEC.md`. Leggerla prima di ogni lavoro non banale.

## Regole d'oro (non negoziabili)

1. **Mai inventare contenuti.** Esperienze, certificazioni, date, aziende, copy marcati `TODO(Alessandro)` → segnaposto ben visibile + chiedere.
2. **Mai dati reali dell'infrastruttura** (IP, domini, hostname, identificativi, sito "Ditta", firewall/VLAN). Scena Homelab: tutto generico/inventato; Region B = "Produzione".
3. **Zero JS su `/`, `/recruiter`, `/agent`** (terminale d'ingresso: solo miglioramento progressivo facoltativo). Nessun asset 3D/Three.js fuori da `/human`.
4. **Una sola fonte dati** (YAML IT/EN validati con Zod): niente testo hardcoded nei componenti, ogni contenuto IT ha il corrispettivo EN.
5. **Colori solo come token** nel file di tema (Catppuccin Mocha default). Contrasto WCAG AA.
6. **Nessun segreto nel repo**; nessuna componente AI interattiva sul sito.

## Stack

Astro (SSG) · TypeScript strict · CSS puro + `@catppuccin/palette` · Three.js vanilla (solo `/human`) · pnpm · Vitest + Playwright (suite JS off) + axe + Lighthouse CI · gitleaks · Cloudflare Pages.

## Workflow

- Task tracciati su PACA, progetto **Portfolio** (prefisso `PORT`). Branch per task: `PORT-<n>-<slug>`.
- Commit/PR solo su richiesta; mai su `main` direttamente.
