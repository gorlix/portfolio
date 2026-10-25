import { describe, expect, it } from 'vitest';
import { aiCrawlers, renderRobotsTxt } from '../../src/lib/machine/robots';
import { renderSitemapXml } from '../../src/lib/machine/sitemap';

describe('robots.txt', () => {
  const out = renderRobotsTxt();

  it('consente esplicitamente ogni crawler AI e chiude /admin in ogni gruppo', () => {
    for (const agent of ['*', ...aiCrawlers]) {
      expect(out, agent).toContain(`User-agent: ${agent}\nAllow: /\nDisallow: /admin\n`);
    }
    expect(out).not.toMatch(/^Disallow: \/$/m);
  });

  it('dichiara la sitemap sull apex', () => {
    expect(out).toContain('Sitemap: https://alessandrogorla.it/sitemap.xml');
  });
});

describe('sitemap.xml', () => {
  it('ha una voce per lingua con alternate reciproci e x-default', () => {
    const out = renderSitemapXml(['/']);
    expect(out).toContain('<loc>https://alessandrogorla.it/</loc>');
    expect(out).toContain('<loc>https://alessandrogorla.it/en/</loc>');
    expect(out.match(/hreflang="x-default" href="https:\/\/alessandrogorla\.it\/"/g)).toHaveLength(
      2,
    );
    expect(out.match(/<url>/g)).toHaveLength(2);
  });

  it('esegue l escape dei caratteri speciali XML', () => {
    expect(renderSitemapXml(['/a&b'])).toContain('/a&amp;b/');
  });
});
