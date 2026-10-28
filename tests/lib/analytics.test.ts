import { describe, expect, it } from 'vitest';
import { BEACON_SRC, beaconConfig } from '../../src/lib/analytics';

describe('beaconConfig', () => {
  // Token finto, composto a runtime: non deve somigliare a una chiave vera.
  const token = 'ab'.repeat(16);

  it('token valido: JSON per data-cf-beacon', () => {
    expect(JSON.parse(beaconConfig(token) ?? '{}')).toEqual({ token });
  });

  it('normalizza spazi e maiuscole', () => {
    expect(JSON.parse(beaconConfig(`  ${token.toUpperCase()}\n`) ?? '{}')).toEqual({ token });
  });

  it('assente, vuoto o malformato: nessun beacon', () => {
    for (const bad of [
      undefined,
      '',
      '   ',
      'TODO',
      token.slice(1),
      `${token}0`,
      `${token.slice(1)}z`,
    ]) {
      expect(beaconConfig(bad)).toBeUndefined();
    }
  });

  it('il token non puo uscire dal valore JSON (niente virgolette o tag)', () => {
    expect(beaconConfig('"}</script><script>alert(1)</script>')).toBeUndefined();
  });

  it('il beacon e quello ufficiale Cloudflare, in https', () => {
    expect(BEACON_SRC).toBe('https://static.cloudflareinsights.com/beacon.min.js');
  });
});
