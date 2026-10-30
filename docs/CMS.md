# CMS (Sveltia) — uso e piano

Pannello **Sveltia CMS** su `/admin/`, per modificare i YAML IT/EN di `src/content/` senza toccare i file a mano. Git-based: il CMS legge e scrive i file del repository, il commit lo fai tu.

## Fase 1 — in locale (attiva)

Nessun login, nessun server: Sveltia usa la File System Access API di Chrome/Edge e lavora direttamente sulla cartella del repo.

1. `pnpm install` (una volta), poi `pnpm dev`.
2. Apri `http://localhost:4321/admin/` in **Chrome o Edge** (Firefox e Safari non supportano l'accesso alle cartelle).
3. **Work with Local Repository** → scegli la cartella del repo → consenti la modifica.
4. Scegli «Pagine e testi» (una voce per file singolo: `profile`, `human`, ...) o una collezione (`projects`, `experiences`, ...). Ogni voce ha le due lingue (IT/EN) affiancate.
5. Modifica, **Save**. Il file cambia sul disco: `git diff`, poi commit/PR come sempre (branch `PORT-<n>-<slug>`, mai su `main`).

Cose da sapere:

- Il CMS **riscrive il file YAML intero**: ordine dei campi e virgolette sono normalizzati (virgolette doppie), i **commenti YAML si perdono** (oggi solo `infrastructure`). Controlla sempre `git diff`.
- I dati non noti (data, ente, link di verifica, linguaggio, metodo) sono campi facoltativi: lasciati vuoti, la riga non compare sul sito. Non esiste piu un segnaposto `todo`.
- I campi **non traducibili** (URL, id, numeri...) sono modificabili solo in IT e copiati in EN (`i18n: duplicate`); quelli traducibili sono liberi nelle due lingue. L'elenco e quello degli schemi (`translatable` in `src/lib/schemas/*`).
- L'upload di media non fa parte della fase 1: foto in `src/assets/` e CV in `public/cv/` si gestiscono da file. `media_folder` punta a `public/cv` solo perche Sveltia ne richiede uno.
- `/admin` non compare in sitemap, `llms.txt` o pagine del sito; `robots.txt` lo chiude e la pagina ha `noindex`.

## Come e fatto

- `src/lib/cms/config.ts` genera la configurazione dagli **schemi Zod** (`src/lib/data/collections.ts`): tipi → widget (stringa, testo, numero, booleano, select da enum, lista, oggetto), campi opzionali/`todo` → non obbligatori, `translatable` → `i18n: true`, il resto `i18n: duplicate`.
- `pnpm cms:config` rigenera `public/admin/config.yml` (**committato, non modificarlo a mano**). `tests/cms` fallisce se diverge dagli schemi, se manca una collezione di `src/content`, se i percorsi non coincidono con i file o se il config non rispetta lo schema ufficiale di Sveltia. Dopo aver cambiato uno schema: `pnpm cms:config` e commit.
- `@sveltia/cms` e una dipendenza **a versione esatta** (Renovate la aggiorna). `pnpm cms:assets` (parte da solo prima di `dev` e `build`) copia in `public/admin/` lo script, i pezzi caricati a richiesta, i font (pacchetti `@fontsource`) e le stringhe in italiano; questi file sono generati e ignorati da git. Lo script di Sveltia di base cerca font, lingue e controllo aggiornamenti su `unpkg.com`/`cdn.jsdelivr.net`: `scripts/copy-cms.mjs` riscrive gli indirizzi verso copie locali e **fallisce** se Sveltia cambia quelle stringhe (aggiornamento di versione: ricontrolla).
- **CSP** solo per `/admin/*` in `public/_headers`: `script-src 'self'` (niente `unsafe-eval` ne script inline), `style-src 'self' 'unsafe-inline'` (Sveltia/Svelte scrivono stili da script: e l'unico `unsafe-inline` del sito), `connect-src 'self' data:`, nessun dominio esterno. Con questa CSP Sveltia prova ancora a contattare `unpkg.com` (controllo aggiornamenti) e `githubstatus.com` (stato GitHub): le richieste sono **bloccate di proposito**, nella console compaiono come errori e non cambiano nulla. `/`, `/recruiter`, `/agent`, `/human` non cambiano; `scripts/check-budget.ts` e `validate-machine.ts` escludono `admin/` (codice di terzi, non una pagina del sito).

## Fase 2 — modifica da remoto con login GitHub (NON attiva)

Serve per modificare da qualsiasi browser/dispositivo (anche senza il repo sul disco): Sveltia fa login con GitHub e scrive i commit via API. Servono un'OAuth App e un piccolo Worker Cloudflare. **Nessun segreto nel repo**: id e segreto si impostano solo da dashboard o `wrangler`.

Passi (a cura di Alessandro, servono i suoi account):

1. **Worker**: deploy di [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) su Cloudflare Workers (es. `https://sveltia-cms-auth.<account>.workers.dev`, oppure un dominio dedicato).
2. **GitHub OAuth App** (Settings → Developer settings → OAuth Apps → New): _Homepage URL_ = URL del sito, _Authorization callback URL_ = `https://<URL del Worker>/callback`. Annota il _Client ID_ e genera un _Client secret_.
3. **Segreti del Worker** (dashboard Cloudflare → Worker → Settings → Variables and Secrets, oppure `wrangler secret put`):
   - `GITHUB_CLIENT_ID` = Client ID
   - `GITHUB_CLIENT_SECRET` = Client secret (tipo _secret_)
   - `ALLOWED_DOMAINS` = dominio del sito che puo usare il login (es. quello di produzione)
4. **Config**: in `src/lib/cms/config.ts` aggiungere `base_url: 'https://<URL del Worker>'` al `backend`, poi `pnpm cms:config` e commit.
5. **CSP**: in `public/_headers`, regola `/admin/*`, aggiungere a `connect-src` `https://api.github.com` e l'origine del Worker (e a `form-action`/`frame-src` solo se il login lo richiede: provarlo con la console del browser aperta). Aggiornare il test in `tests/headers/headers.test.ts` (oggi vieta ogni `https:` in `/admin/*`).
6. **Protezione**: la OAuth App deve poter scrivere solo su `gorlix/portfolio` (limitare l'accesso o usare un account con quel solo permesso); `main` resta protetto, quindi i salvataggi passano per branch + PR. Per questo, in fase 2, valutare `publish_mode: editorial_workflow`.
7. Prova: `/admin/` in produzione → **Sign In with GitHub** → modifica un campo → verifica il commit/branch.

Ripristino: togliere `base_url` e rigenerare il config riporta alla modalita solo locale.
