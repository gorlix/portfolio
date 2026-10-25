import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alessandrogorla.it',
  output: 'static',
  trailingSlash: 'always',
  // La CSP vieta gli stili inline: i CSS restano sempre file separati.
  build: { inlineStylesheets: 'never' },
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
