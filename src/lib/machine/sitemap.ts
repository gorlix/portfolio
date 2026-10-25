import { absoluteUrl, alternates, localizedPath, sitePages } from '../i18n';
import { locales } from '../schemas/common';

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sitemap con una voce per lingua e gli alternate IT/EN/x-default su ognuna. */
export function renderSitemapXml(pages: readonly string[] = sitePages): string {
  const entries = pages.flatMap((page) =>
    locales.map((locale) => {
      const links = alternates(page)
        .map(
          (a) =>
            `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${xmlEscape(a.href)}"/>`,
        )
        .join('\n');
      const loc = xmlEscape(absoluteUrl(localizedPath(page, locale)));
      return `  <url>\n    <loc>${loc}</loc>\n${links}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}
