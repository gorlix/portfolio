import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { locales } from '../../src/lib/schemas/common';

const root = join(import.meta.dirname, '../../src/content/skills');

/** Slug -> tipo e flag `badge` di ogni competenza, per lingua. */
function badgeFlags(locale: string) {
  const dir = join(root, locale);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .map((f) => {
        const data = parse(readFileSync(join(dir, f), 'utf8'));
        return [f.slice(0, -4), { kind: data.kind, badge: data.badge === true }];
      }),
  );
}

describe('badge della prima schermata di /human', () => {
  for (const locale of locales) {
    it(`${locale}: tra 6 e 8 competenze tecniche con badge`, () => {
      const flags = Object.values(badgeFlags(locale));
      const count = flags.filter((f) => f.kind === 'technical' && f.badge).length;
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(8);
      // Il flag ha senso solo sulle competenze tecniche.
      expect(flags.filter((f) => f.badge && f.kind !== 'technical')).toEqual([]);
    });
  }

  it('i flag badge coincidono tra le lingue', () => {
    const [first, ...rest] = locales.map(badgeFlags);
    for (const other of rest) expect(other).toEqual(first);
  });
});
