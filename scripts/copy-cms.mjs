// Copia Sveltia CMS (pacchetto npm, versione pinnata) in `public/admin/`: tutto servito dal sito, niente CDN.
// Lo script cerca i font su cdn.jsdelivr.net: gli indirizzi vengono riscritti verso copie locali dei
// pacchetti @fontsource (stesse versioni). Se Sveltia cambia gli indirizzi lo script fallisce, mai in silenzio.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = new URL('node_modules/@sveltia/cms/', root);
const out = new URL('public/admin/', root);

const cdn = 'https://cdn.jsdelivr.net/fontsource/fonts/';
const fonts = [
  {
    url: `${cdn}source-sans-3:vf@5.3.1/latin-wght-normal.woff2`,
    from: 'node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2',
    to: 'source-sans-3.woff2',
  },
  {
    url: `${cdn}material-symbols-outlined:vf@5.3.9/latin-wght-normal.woff2`,
    from: 'node_modules/@fontsource-variable/material-symbols-outlined/files/material-symbols-outlined-latin-wght-normal.woff2',
    to: 'material-symbols-outlined.woff2',
  },
  {
    url: `${cdn}noto-mono@5.3.0/latin-400-normal.woff2`,
    from: 'node_modules/@fontsource/noto-mono/files/noto-mono-latin-400-normal.woff2',
    to: 'noto-mono.woff2',
  },
];

mkdirSync(out, { recursive: true });

let script = readFileSync(new URL('dist/sveltia-cms.js', pkg), 'utf8');
rmSync(new URL('fonts/', out), { recursive: true, force: true });
mkdirSync(new URL('fonts/', out), { recursive: true });
for (const font of fonts) {
  if (!script.includes(font.url)) throw new Error(`Sveltia non referenzia piu ${font.url}`);
  script = script.replaceAll(font.url, `/admin/fonts/${font.to}`);
  cpSync(new URL(font.from, root), new URL(`fonts/${font.to}`, out));
}

// Stringhe dell'interfaccia in italiano: di default le scarica da unpkg.com.
// (`${versione}` e il nome minificato della costante di versione: cambia da una release all'altra.)
const localesUrl = /https:\/\/unpkg\.com\/@sveltia\/cms@\$\{\w+\}\/locales/g;
if (!localesUrl.test(script)) throw new Error('Sveltia non referenzia piu le lingue su unpkg');
script = script.replace(localesUrl, '/admin/locales');
rmSync(new URL('locales/', out), { recursive: true, force: true });
mkdirSync(new URL('locales/', out), { recursive: true });
cpSync(new URL('locales/it.json', pkg), new URL('locales/it.json', out));

writeFileSync(new URL('sveltia-cms.js', out), script);

// Pezzi caricati a richiesta accanto allo script (backend git, QR, React).
rmSync(new URL('chunks/', out), { recursive: true, force: true });
cpSync(new URL('dist/chunks/', pkg), new URL('chunks/', out), {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});
