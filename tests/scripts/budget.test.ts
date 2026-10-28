import { describe, expect, it } from 'vitest';
import { checkBudgets, linkedAssets, staticImports } from '../../scripts/budget';

const page = (url: string, totalGzip: number, scriptGzip = 0) => ({ url, totalGzip, scriptGzip });

describe('checkBudgets', () => {
  it('accetta pesi entro i budget', () => {
    expect(
      checkBudgets({
        chunks: [{ file: 'three.abc.js', gzip: 100_000 }],
        pages: [page('/', 6000, 1300), page('/recruiter/', 6000), page('/en/human/', 13_000, 2800)],
      }),
    ).toEqual([]);
  });

  it('segnala un chunk o una pagina oltre il budget', () => {
    const errors = checkBudgets({
      chunks: [{ file: 'homelab.x.js', gzip: 40_000 }],
      pages: [page('/agent/', 6000, 500)],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('homelab.x.js');
    expect(errors[1]).toContain('script');
  });

  it('un chunk nuovo senza budget e un errore, non passa in silenzio', () => {
    expect(checkBudgets({ chunks: [{ file: 'zzz.x.js', gzip: 10 }], pages: [] })[0]).toContain(
      'senza budget',
    );
  });
});

describe('analisi degli asset', () => {
  it('trova CSS e moduli collegati, non gli import pigri', () => {
    const html =
      '<link rel="stylesheet" href="/_astro/a.css"><script type="module" src="/_astro/b.js"></script>';
    expect(linkedAssets(html)).toEqual({ css: ['/_astro/a.css'], scripts: ['/_astro/b.js'] });
    expect(staticImports('import"./c.js";import{x}from"./d.js";import("./lazy.js")')).toEqual([
      './c.js',
      './d.js',
    ]);
  });
});
