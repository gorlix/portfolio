import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alessandrogorla.it',
  output: 'static',
  trailingSlash: 'always',
  // La CSP vieta gli stili inline: i CSS restano sempre file separati.
  build: { inlineStylesheets: 'never' },
  // Idem per gli script: la CSP vieta lo script inline, quindi mai inline anche se piccoli.
  // three (solo /human) sta in un chunk a se, condiviso dalle scene e mai referenziato dal bootstrap.
  vite: {
    build: {
      assetsInlineLimit: 0,
      // three minificato pesa ~530 KB (~130 KB gzip): atteso, caricato solo su richiesta.
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] },
        },
      },
    },
  },
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
