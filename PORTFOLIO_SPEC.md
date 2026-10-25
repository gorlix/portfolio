# PORTFOLIO_SPEC — Sito portfolio di Alessandro Gorla

> Documento fondante per Claude Code. Raccoglie visione, decisioni prese, architettura, contenuti, regole non negoziabili e punti ancora aperti.
> **Regola d'oro:** dove un contenuto è segnato `TODO(Alessandro)` NON va inventato. Si lascia un segnaposto ben visibile e si chiede.
> Nessun codice in questo documento: sono i requisiti, le scelte tecniche le propone Claude Code entro i vincoli qui sotto.

---

## 1. Visione

Un portfolio che faccia dire **"wow"** e che rappresenti Alessandro **al 100%**: tecnico (DevOps, homelab, domotica con Home Assistant), ma anche sportivo, volontario, curioso, ironico e maniacale sui dettagli.

Il sito **non è una pagina unica**: è un ingresso che chiede *chi sei* e carica **solo** la parte pertinente, con tre registri diversi.

| Percorso | Chi | Tono | Tecnologia |
|---|---|---|---|
| **Recruiter** | Recruiter, HR, hiring manager | Formale, istituzionale, essenziale | HTML + CSS, **zero JS** |
| **AI Agent** | Crawler, LLM, agenti | Tecnico, neutro, machine-first | HTML + CSS, **zero JS**, più file nella root |
| **Umano** | Chiunque voglia conoscerlo | Creativo, ironico, personale ("me e me a pieno") | 3D low-poly immersivo (JS solo qui) |

**Vincolo editoriale importante:** nessuna componente AI sul sito (niente chatbot, niente assistenti). La sezione Agent è solo una pagina leggibile dalle macchine.

---

## 2. Principi non negoziabili

1. **Static-first.** Il sito è generato in anticipo (SSG) e ospitato staticamente. Nessun server applicativo.
2. **Caricare solo ciò che serve.** Ogni percorso ha il proprio bundle. Chi sceglie Recruiter o Agent non scarica mai 3D né JS.
3. **Funziona senza JavaScript** per: ingresso, recruiter, agent. L'Umano ha un fallback testuale completo.
4. **Accessibilità reale** (vedi §10), non di facciata.
5. **Una sola fonte dati** (vedi §8): si modifica un contenuto in un posto e si aggiorna ovunque (recruiter, agent, badge, file nella root, IT/EN).
6. **Sicurezza e privacy** (vedi §11): nessun dato reale dell'infrastruttura, nessun dato personale non voluto.
7. **Mai inventare contenuti.** Esperienze, certificazioni, date, nomi di aziende: solo da dati forniti.

---

## 3. Stack tecnologico, linguaggi e infrastruttura

Le scelte qui sotto sono il **default concordato**. Claude Code può proporre alternative solo motivandole e senza violare i principi del §2. I punti ancora da confermare sono nel §15 (voci 12–15).

### 3.1 Linguaggi e framework

| Ambito | Scelta | Motivo |
|---|---|---|
| Generatore del sito | **Astro** (SSG) | HTML puro di default, JavaScript solo dove serve ("isole"), routing i18n integrato, collezioni di contenuti tipizzate |
| Linguaggio del codice | **TypeScript** in modalità strict | Un solo linguaggio per sito, scene 3D, simulazione metriche e generatori |
| Dati | **YAML** (o JSON) in due lingue, validati con schemi **Zod** (collezioni di contenuti Astro) | Un dato sbagliato o mancante deve far fallire la build, non il sito |
| Stile | **CSS puro** con variabili (token) del tema; palette dal pacchetto ufficiale `@catppuccin/palette` | Recruiter e Agent restano a zero JS; niente framework CSS necessario |
| 3D | **Three.js** "vanilla" (senza React) caricato solo da `/human` | Three.js pesa circa 150–200 KB compressi: va caricato dopo il primo contenuto visibile e mai fuori dal percorso Umano |
| Animazioni su scroll | **GSAP + ScrollTrigger** (gratuito), oppure CSS scroll-driven dove basta | Controllo fine sulle micro-scene |
| Font | **Fontsource**, self-hosted: un monospazio (es. JetBrains Mono) e un sans leggibile (es. Inter) | Nessuna dipendenza esterna a runtime |
| Effetto di digitazione del terminale | **JavaScript minimo**, solo miglioramento progressivo | Il testo c'è già nell'HTML (§6) |
| Simulazione metriche Homelab | Modulo **TypeScript** nel browser: rumore con seme + curva giornaliera + eventi (failover, picchi) | Credibile, riproducibile, nessun contatto con l'infrastruttura reale |

- **Rust:** non necessario per il sito. Compare solo se Alessandro lo vuole come esperimento (es. simulatore in WebAssembly): **di default no**, per non complicare la build.
- **Modelli 3D:** la scelta di base è **geometria procedurale low-poly generata nel codice** (primitive, flat shading, palette Catppuccin), con pochissimi file **glTF** compressi (meshopt/Draco) solo se servono, ad esempio per i personaggi dello sport. Nessuna texture fotografica. Il punto più delicato sono i personaggi (pallavolo): vanno fatti a blocchi stilizzati.
- **Smooth scroll:** da evitare o rendere disattivabile (accessibilità, §10).

### 3.2 Qualità e strumenti di sviluppo

- **Gestore pacchetti:** pnpm, Node.js LTS con versione fissata nel repo.
- **Qualità del codice:** ESLint + Prettier (o Biome), TypeScript strict, controllo dei tipi in CI.
- **Test:** Vitest per i generatori e gli schemi dati; **Playwright** per i test end-to-end, compresa una suite **con JavaScript disattivato** per `/`, `/recruiter` e `/agent`; **axe** per l'accessibilità; **Lighthouse CI** con budget di peso.
- **Validazione dei file per macchine:** controlli automatici su `llms.txt`, `profile.json`, JSON-LD e sitemap.
- **Segreti:** nessuno nel repo; **gitleaks** come pre-commit hook e in CI (coerente con il repo homelab).

### 3.3 Repository e CI/CD

- **Repository GitHub**, privato durante lo sviluppo. Se diventa pubblico al lancio (decisione aperta, §15), va controllato che non contenga dati personali non approvati.
- **GitHub Actions:** lint, typecheck, test, build, Lighthouse, gitleaks. Deploy automatico su Cloudflare, con **anteprima per ogni branch**.
- **Renovate** per gli aggiornamenti delle dipendenze (Alessandro lo usa già nell'homelab). Per le dipendenze principali, aggiornamenti non automatici: devono passare i test.
- Nel repo: `PORTFOLIO_SPEC.md` in radice e un `CLAUDE.md` breve che lo richiama e riassume le regole d'oro (nessun contenuto inventato, nessun dato reale dell'infrastruttura, zero JS su recruiter e agent).

### 3.4 Infrastruttura e hosting

- **Cloudflare Pages** per il sito statico (o l'equivalente con asset statici su Workers, se Claude Code lo ritiene più indicato). Dominio già posseduto: `TODO(Alessandro): dominio`; DNS su Cloudflare.
- **Header di sicurezza e CSP** tramite file `_headers`; reindirizzamenti con `_redirects`. CSP restrittiva: niente script o stili da domini esterni.
- **Email dedicata** sul dominio con **Cloudflare Email Routing** (inoltro alla casella personale): nessuna casella nuova da gestire, e l'indirizzo personale non finisce nei file per macchine.
- **Nessun modulo di contatto e nessun backend**: solo link `mailto:`. Meno superficie d'attacco, nessuna gestione di spam o dati degli utenti.
- **Nessuna dipendenza dall'homelab** per servire il sito pubblico: se l'homelab è spento, il sito funziona. Niente collegamenti tra il sito e l'infrastruttura reale.
- **Analitica:** nessuna oppure Cloudflare Web Analytics (senza cookie). Decisione aperta (§15).

### 3.5 Budget di peso (proposta, da misurare in fase 6)

- `/`, `/recruiter`, `/agent`: ordine di **poche decine di KB** ciascuna, zero JS (il terminale può avere un piccolo script facoltativo).
- `/human`: primo contenuto visibile **prima** del caricamento del 3D; ogni sezione carica i propri asset solo quando l'utente si avvicina.
- Obiettivi Lighthouse indicativi: ≥ 95 su Performance, Accessibilità, Best Practices e SEO per i tre percorsi leggeri.

### 3.6 Lingue

Italiano e inglese, entrambe complete (vedi §9), con routing i18n di Astro e `hreflang`.

---

## 4. Tema visivo: Catppuccin

Tema scelto da Alessandro: **Catppuccin**.

- **Default scuro: Mocha.** Base `#1e1e2e`, mantle `#181825`, crust `#11111b`, text `#cdd6f4`, subtext `#bac2de` / `#a6adc8`, superfici `#313244` / `#45475a` / `#585b70`.
- **Accenti** (Mocha): rosewater `#f5e0dc`, flamingo `#f2cdcd`, pink `#f5c2e7`, mauve `#cba6f7`, red `#f38ba8`, maroon `#eba0ac`, peach `#fab387`, yellow `#f9e2af`, green `#a6e3a1`, teal `#94e2d5`, sky `#89dceb`, sapphire `#74c7ec`, blue `#89b4fa`, lavender `#b4befe`.
- **Variante chiara: Latte** (base `#eff1f5`, text `#4c4f69`) da valutare almeno per il recruiter, in base a `prefers-color-scheme` (decisione aperta, §15).
- Tutti i colori vivono come **token in un unico file di tema**. Mai valori hardcoded sparsi.
- **Contrasto:** verificare WCAG AA su ogni coppia testo/sfondo. I grigi più tenui di Catppuccin (overlay) **non** vanno usati per testo di corpo.
- **Tipografia:** monospazio per titoli, etichette e comandi (richiamo terminale Linux); sans-serif leggibile per i testi lunghi. Font self-hosted, nessuna dipendenza esterna a runtime.

**Filo conduttore tra i tre percorsi:** stessa palette, stesso carattere dei titoli, stesso selettore lingua, stesso link per tornare alla scelta. Cambiano solo tono e intensità.

**Colore per sezione (Umano), proposta modificabile in un solo file:**

| Sezione | Accento |
|---|---|
| Lavori | blue |
| Homelab | green |
| Domotica | yellow / peach |
| Certificazioni | mauve |
| Sport | sky (+ peach per la terra rossa) |
| Interessi | pink / flamingo |
| Beneficenza | teal |
| Contatti | lavender |

---

## 5. Mappa del sito e URL

```
/                      Pagina 1: terminale d'ingresso (scelta)
/recruiter             Landing page single-page professionale
/agent                 Vetrina estetica in stile terminale (human-readable)
/human                 Percorso immersivo 3D
/en/...                Stesse pagine in inglese (struttura speculare)

Root (testo puro, per macchine):
/llms.txt   /agent.md   /profile.json   /robots.txt   /sitemap.xml
```

- Ogni percorso ha un **indirizzo diretto** valido: chi arriva con `/recruiter` salta il terminale.
- Link discreto per **tornare alla scelta** presente in tutti i percorsi.
- Le sezioni dell'Umano sono raggiungibili via ancora (`/human#homelab`) e condivisibili.

---

## 6. Pagina 1 — Il terminale d'ingresso (`/`)

**Concept:** una finestra di terminale. Saluta, si presenta, poi chiede chi sei.

- **Testo di apertura (tono ironico, con "qualche leccata"):** in sostanza *"Ciao umano, questo è il portfolio e la presentazione di Alessandro Gorla"*, con battute leggere sulla sua bravura. `TODO(Alessandro): approvare/riscrivere il copy; Claude Code può proporre 2–3 varianti con diversa intensità di ironia.`
- **Poi la domanda: "sei un…"** con **tre scelte**: **AI Agent**, **Recruiter**, **Umano** (ordine esatto: decisione aperta, §15).
- **Selezione:** click/tap, frecce + invio, oppure digitando 1/2/3.
- **Lingua:** selettore IT/EN nel terminale stesso (es. comando `lang`), scelta ricordata.

**Requisiti obbligatori**
- **Tutto il testo e i tre link sono nell'HTML**, leggibili senza JS e senza attendere l'effetto di digitazione. L'effetto "scrittura" è un miglioramento facoltativo.
- **Pulsante "salta"** sempre presente. Rispetto di `prefers-reduced-motion` (in quel caso niente digitazione).
- **SEO:** pagina indicizzabile (titolo, descrizione, nome, Open Graph, canonical, `hreflang` IT/EN).
- Leggerissima: nessun 3D, JS minimo o assente.

---

## 7. I tre percorsi

### 7.1 Recruiter (`/recruiter`) — landing single-page

**Registro:** formale, istituzionale. **Niente ironia** (resta nel terminale e nell'Umano). "Linux ma elegante": monospazio per titoli ed etichette, comandi come `~/esperienza` o `$ whoami` solo come tocco grafico, palette Catppuccin sobria, molto respiro, **nessun effetto da film hacker**.

**Struttura (una pagina a scorrimento, menu fisso con ancore, zero JS):**
1. **Apertura:** foto + **frase personale** (decisi: sì a entrambe) + ruolo + disponibilità.
2. **Competenze** raggruppate (cloud, CI/CD, container, monitoring, automazione domestica, linguaggi).
3. **Esperienze** in ordine cronologico, con risultati concreti.
4. **Certificazioni tecniche in evidenza** (le accessorie più in basso, piccole).
5. **Progetti scelti** (3–4, con homelab e Home Assistant in testa).
6. **Formazione.**
7. **Contatti** + pulsante **CV (PDF)** sempre visibile.
- In fondo e nel menu: "Conoscimi meglio" → `/human`, "Vista macchina" → `/agent`.

**Dati chiave:** *Alessandro Gorla — DevOps & Home Automation — Milano — Hybrid Milano, remote ovunque.*

**Altri requisiti:** layout **stampabile / esportabile in PDF**; leggibile da telefono; foto con testo alternativo e versioni ottimizzate (Alessandro fornisce l'originale in alta qualità).

> Presentazione progetti: la distinzione "vibecoded / con AI / fatto a mano" (dal suo GitHub) va resa in modo **neutro**, come nota sul metodo di lavoro. Vedi anche ADR-000 del repo homelab sulla metodologia AI.

### 7.2 AI Agent (`/agent` + file nella root)

**Due livelli distinti:**

1. **File veri, nella root** (quelli che leggono davvero crawler e agenti): `/llms.txt`, `/agent.md`, `/profile.json`, `/robots.txt`, `/sitemap.xml`. Testo puro, niente grafica, sempre raggiungibili e aggiornati. Lingua principale **inglese**, con riferimenti all'italiano.
2. **Pagina `/agent`:** vetrina estetica, **terminale minimale ma non brutto**, che mostra gli stessi file (`cat llms.txt`, `cat profile.json`) con link per scaricarli. Generata **dagli stessi dati**, così pagina e file non si contraddicono mai.

**Requisiti**
- **HTML semantico** puro: titoli ordinati, liste e tabelle vere, tutto nel sorgente (la maggior parte dei crawler AI non esegue JS).
- **JSON-LD** schema.org (`Person`, competenze, certificazioni, progetti) incorporato nella pagina.
- **Meta tag puliti** (titolo, descrizione, canonical, Open Graph).
- **`robots.txt` esplicito** per i crawler AI. `TODO(Alessandro): quali crawler consentire/bloccare (es. GPTBot, ClaudeBot, PerplexityBot)`.
- Eventuale pulsante "vista umana / vista macchina" **solo se resta senza JS** (altrimenti due sezioni affiancate).
- Nessuna funzione AI interattiva.

### 7.3 Umano (`/human`) — il percorso immersivo

**Struttura:** una **sequenza di sezioni a schermo pieno**, ognuna con il proprio colore (§4), più una **barra del tempo verticale a sinistra** che fa da menu.

**Ordine delle sezioni**
1. **Home** (prima schermata)
2. **Lavori**
3. **Homelab** (interattiva)
4. **Domotica** (interattiva)
5. **Certificazioni**
6. **Sport**
7. **Interessi** (una sola sezione per gli hobby)
8. **Beneficenza**
9. **Contatti**

**Prima schermata (Home dell'Umano)**
- Saluto, **foto e avatar low-poly** (entrambi: da valutare l'equilibrio), invito a scorrere.
- **Piccoli badge delle competenze tecniche** (solo nomi per ora, cliccabili verso la sezione dove quella competenza si vede in azione). Quanti badge e se c'è un indicatore di livello: **decisioni rimandate** (§15).
- La barra laterale è già visibile, così si capisce che si può saltare.

**Barra del tempo verticale (menu)**
- Linea sottile con un punto per sezione; il punto attivo si illumina nel colore della sezione; hover/tap mostra il nome in stile terminale (`~/lavori`).
- Click = salto alla sezione. Lo scroll aggiorna la barra e viceversa. Le sezioni lunghe possono avere sotto-segmenti (es. Sport: sci, tennis, pallavolo).
- **Mobile:** linea sottile + pulsante menu che apre l'elenco completo.
- Esiste anche come **elenco di link HTML puro** (funziona senza JS, per screen reader).
- Navigabile da tastiera, con focus visibile. Lo stato (`#sezione`) si riflette nell'URL.

**Layout delle sezioni**
- **Sezioni interattive (Homelab, Domotica):** titolo **in alto a sinistra**, con leggero gradiente dello stesso colore dello sfondo, e al **centro il modello 3D** protagonista.
- **Sezioni narrative (tutte le altre):** **narrazione in prima persona alternata a micro-scene 3D** brevi (pochi secondi), guidate dallo scroll.
- **Lo scroll non viene mai bloccato:** l'interazione nelle sezioni interattive è facoltativa e chi vuole può passare oltre.

---

## 8. Dati: una sola fonte di verità

Tutti i contenuti vivono in **file dati strutturati** (es. YAML/JSON) in due lingue. Da questi si **generano**: recruiter, pagina agent, file nella root, badge, barra del tempo, e il CV in forma coerente.

Entità principali (campi indicativi):
- **Profilo:** nome, ruolo, località, disponibilità, frase personale IT/EN, link (GitHub, LinkedIn, dev.to, X), contatto dedicato.
- **Competenze:** nome, gruppo, `tipo: tecnica | accessoria`, `sezione_collegata`.
- **Esperienze:** azienda, ruolo, date, risultati, stack. `TODO(Alessandro)`
- **Certificazioni:** nome, ente, data, link di verifica, `tipo: tecnica | accessoria`. `TODO(Alessandro)`
- **Progetti:** nome, descrizione IT/EN, repo, linguaggio, **metodo** (`a mano | con AI | vibecoded`), stato.
- **Automazioni Home Assistant:** nome, stanza, trigger, condizioni, azioni, link al repo. (Oggi quasi nulla è pubblico: il modello va predisposto.)
- **Infrastruttura simulata (Homelab):** nodi, region, servizi, relazioni, ADR collegati (vedi §12).
- **Sport / Interessi / Beneficenza:** testi narrativi + riferimenti.
- **Tema:** colori, colori per sezione, ordine delle sezioni.

---

## 9. Internazionalizzazione

- **Italiano e inglese**, entrambi completi, con struttura URL speculare e `hreflang`.
- Ogni stringa e ogni contenuto in entrambe le lingue; niente testo nei componenti.
- Il profilo macchina è principalmente **in inglese** (è ciò che gli agenti cercano di più), con riferimenti all'italiano.
- Il tono ironico va **adattato**, non tradotto alla lettera, in inglese.
- Selettore lingua sempre presente; scelta ricordata.

---

## 10. Accessibilità e performance

**Accessibilità (target WCAG 2.2 AA)**
- Tutto navigabile da **tastiera**, focus visibile, link "salta al contenuto".
- **Screen reader:** HTML semantico, landmark, testi alternativi; ogni sezione 3D ha un **equivalente testuale** con gli stessi contenuti.
- **`prefers-reduced-motion`:** niente animazioni non essenziali, niente effetto di scrittura nel terminale, scene 3D sostituite da versioni statiche.
- Contrasto verificato, testo ridimensionabile, nessuna informazione solo a colori.
- Audio: **nessun suono automatico**. Eventuale ambient solo se l'utente lo attiva (decisione aperta, §15).

**Performance**
- Ingresso, recruiter, agent: **leggeri** (nessun JS, immagini ottimizzate, font self-hosted).
- Umano: caricamento **pigro per sezione**; le scene si **mettono in pausa fuori schermo**.
- **Fallback 3D:** rilevare WebGL assente, dispositivo debole, risparmio dati o batteria bassa e passare a una versione ridotta (meno oggetti, animazioni semplici) o a quella testuale.
- **Mobile:** le scene interattive restano ma con meno dettaglio e controlli tattili semplici.
- `TODO` Definire budget di peso per percorso in fase di implementazione e misurarli.

---

## 11. Sicurezza e privacy

- **Mai dati reali dell'infrastruttura** nella scena Homelab: nessun IP, dominio, hostname, identificativo. Tutto inventato o generico.
- **Nessun dettaglio sul sito "Ditta"** come luogo fisico né sul firewall/VLAN dell'azienda ospitante: nella scena la Region B è semplicemente **"Produzione"**.
- Le metriche sono **generate nel browser**, senza alcuna connessione all'infrastruttura reale.
- **Contatti:** usare un indirizzo email **dedicato sul dominio del sito** (non quello personale, già pubblico su GitHub), per limitare lo spam, specialmente nei file per macchine. Niente numero di telefono, niente indirizzo.
- Foto e dati personali: solo ciò che Alessandro approva esplicitamente.
- Nessun segreto nel repo; header di sicurezza e CSP configurati su Cloudflare Pages.

---

## 12. Sezioni interattive in dettaglio

### 12.1 Homelab (basata su `github.com/gorlix/homelab`, sanitizzata)

**Fonte reale (riassunto):** 3 nodi Proxmox VE su **due siti**; Tailscale come overlay tra i siti; Cloudflare Tunnel e Traefik per ogni sito; OpenTofu + Ansible; Docker Compose versionato con Renovate e deploy automatico; AdGuard Home in alta disponibilità con Keepalived; Authentik (SSO), Nextcloud, Frigate, monitoring; backup Home Assistant 3-2-1 (Cloudflare R2, Google Drive, copia locale); secret management con 1Password Connect e Infisical; documentazione con ADR; Kubernetes + Flux in corso (WIP).

**Scena 3D (centro schermo):**
- **Due piattaforme low-poly** (*Casa* e *Produzione*) collegate da un fascio di luce (overlay).
- **Click su un nodo:** pannello con i servizi ospitati.
- **Metriche e log simulati ma credibili:** CPU, RAM, rete con andamenti giornalieri realistici; log che scorrono.
- **Gesto interattivo:** un pulsante per **provocare un failover DNS** (l'IP virtuale passa da primario a backup). `TODO(Alessandro): confermare che il gesto piace`.
- **Layer "Backup 3-2-1":** frecce verso i tre destinatari.
- **Layer "Decisioni":** click su un nodo → ADR collegato, riassunto di due righe e link al repo.
- **Elementi non ancora completati** (K8s/Flux, CI) mostrati come strutture **trasparenti "in costruzione"**: onestà sul lavoro in corso.
- **Equivalente testuale** completo (tabella dei nodi e dei servizi) per accessibilità e crawler.

### 12.2 Domotica (Home Assistant)

- **Casa 3D low-poly** con stanze cliccabili che si illuminano quando si attiva un'automazione.
- Click su una stanza/dispositivo: **trigger → condizioni → azioni** dell'automazione.
- Oggi poco è pubblico: predisporre il modello dati (§8) e popolarlo **quando le automazioni verranno pubblicate**. Nel frattempo, partire dai progetti già pubblici: `focus-mode-app-linux` + `ha-focus-mode-linux` (sincronizzazione con il Non Disturbare di Android via HA) e la strategia di backup Zigbee.
- `TODO(Alessandro): elenco, anche grezzo, delle automazioni da mostrare.`
- Equivalente testuale (elenco automazioni) incluso.

---

## 13. Sezioni narrative in dettaglio

Tutte: prima persona, tono di Alessandro (ironico, preciso, un po' maniacale sui dettagli: "smanetto, rompo cose e poi le rimetto insieme meglio di prima"), micro-scene brevi.

- **Lavori:** timeline verticale; ogni esperienza è una micro-scena con ruolo, periodo, uno o due risultati. `TODO(Alessandro): dati da LinkedIn` (il profilo non è leggibile automaticamente: servono screenshot o testo).
- **Certificazioni:** **tecniche** = badge 3D grandi che si materializzano uno alla volta, con ente, data e link di verifica. **Accessorie** (BLSD, idrogeologico e simili) = fila di badge piccoli più sotto, titolo "Altro che ho imparato". Le tecniche compaiono **anche come piccoli badge nella prima schermata** dell'Umano e in evidenza nel recruiter.
- **Sport:** tre micro-scene, ciascuna con una frase sua:
  - **Sci:** montagna 3D, una linea che scende ("la curva perfetta").
  - **Tennis:** la pallina segna la riga, solleva la terra rossa e arriva verso lo schermo.
  - **Pallavolo:** due personaggi low-poly e un bagher ("passato da pallavolista").
- **Interessi** *(una sola sezione)*: stampa 3D, tastiera **ZSA Moonlander** con layout personalizzato (layer gaming e layout ibrido US/IT, link Oryx), ebook reader **Supernote** e relativi tool, **Obsidian**, **Rust** (in apprendimento), e **il cibo / i posti dove si mangia bene** (con una battuta; link già presente nel README). La sezione Umano "deve essere Alessandro a pieno": più dettagli personali che omissioni.
- **Beneficenza:** tono più sobrio, meno movimento. **Rotaract Abbiategrasso**; il sito del **primo multidistretto italiano** (`MDIO-website`) come progetto concreto. Una battuta leggera al massimo.
- **Contatti (chiusura):** scena finale tranquilla; ritorno al terminale con un saluto; email dedicata, LinkedIn, GitHub, dev.to, X, pulsante CV.

---

## 14. Materiale noto e fonti

- **GitHub** `github.com/gorlix` (21 repo): Milano; organizzazione RustMinder; link a dev.to, X (`@Goorlix`), zaap.bio.
- **Progetti per metodo:**
  - *A mano:* `my-adept` (firmware trackball Ploopy Adept).
  - *Con AI come copilota:* `MorgenCalendar-Telegram-Bot`, `AuleLiberePoliMi` (adottato quando l'autore ha lasciato; gira sull'homelab), `focus-mode-app-linux` + `ha-focus-mode-linux` (migrazione Python → Rust/Tauri in corso).
  - *Vibecoded:* `sn_make_space`, `sn-tcp-tunnel` (il preferito), `SuperFlow` (WIP). Ruotano attorno al Supernote Manta.
  - **Progetto di punta:** `homelab`.
- **LinkedIn:** `linkedin.com/in/gorla-alessandro/` — **non accessibile in automatico**: esperienze, formazione e certificazioni arriveranno da Alessandro.
- **Materiali da ricevere:** CV (PDF), foto in alta qualità, elenco certificazioni (tecniche/accessorie), esperienze, elenco automazioni HA, dominio, indirizzo email dedicato.

---

## 15. Decisioni aperte

1. Ordine esatto delle tre scelte nel terminale (Umano per primo o AI Agent / Recruiter / Umano).
2. Copy del saluto: proposte di Claude Code o scritto da Alessandro.
3. Foto + avatar: equilibrio nelle varie pagine (foto sul recruiter, avatar sull'Umano suggerito).
4. Badge competenze nella prima schermata Umano: **quanti** e **se mostrare un livello** (rimandato).
5. Variante Latte (chiara) oppure solo Mocha.
6. Audio ambient opzionale (default: nessun audio).
7. Crawler AI consentiti/bloccati in `robots.txt`.
8. Analitica: nessuna o privacy-friendly senza cookie.
9. Gesto "failover DNS" nella scena Homelab: confermare.
10. Navigazione dall'Umano al terminale d'ingresso come menu persistente o solo all'inizio/alla fine.
11. Titolo e posizione delle certificazioni accessorie.
12. Modelli 3D: default procedurali nel codice; confermare se Alessandro vuole modellare o usare asset esterni (es. in Blender).
13. Repository: resta privato o diventa pubblico dopo il lancio.
14. Analitica: nessuna o Cloudflare Web Analytics.
15. Email dedicata con Cloudflare Email Routing e nessun modulo di contatto: confermare.

---

## 16. Piano di realizzazione suggerito

0. **Fondamenta:** repo, generatore statico, token Catppuccin, struttura dati IT/EN, i18n, deploy su Cloudflare Pages.
1. **Terminale d'ingresso** (`/`) e **file nella root** (`llms.txt`, `agent.md`, `profile.json`, `robots.txt`, `sitemap.xml`).
2. **Recruiter** (landing) e **Agent** (vetrina), entrambi senza JS, generati dai dati.
3. **Guscio dell'Umano:** sezioni solo testuali, barra del tempo, badge della prima schermata, fallback testuale.
4. **Homelab interattivo**, poi **Domotica interattiva**.
5. **Micro-scene narrative** (Sport, Certificazioni, Lavori, Interessi, Beneficenza, Contatti).
6. **Rifinitura:** accessibilità, performance (con budget misurati), fallback 3D, test su dispositivi deboli, test con screen reader, validazione dati strutturati, controllo contrasti.

**Criteri di accettazione minimi**
- `/`, `/recruiter` e `/agent` si leggono e funzionano **con JavaScript disattivato**.
- Nessun asset 3D viene scaricato fuori da `/human`.
- Tutte le sezioni dell'Umano hanno un equivalente testuale.
- Nessun IP, dominio o identificativo reale in nessun file pubblicato.
- Ogni contenuto IT ha il suo corrispettivo EN.
- I file nella root sono validi e coerenti con la pagina `/agent`.
