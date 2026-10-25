import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alessandrogorla.it',
  output: 'static',
  trailingSlash: 'always',
  // La CSP vieta gli stili inline: i CSS restano sempre file separati.
  build: { inlineStylesheets: 'never' },
  // Idem per gli script: la CSP vieta lo script inline, quindi mai inline anche se piccoli.
  vite: { build: { assetsInlineLimit: 0 } },
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
