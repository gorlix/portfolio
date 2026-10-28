/*
 * Cloudflare Web Analytics (senza cookie), solo su /human. Il token e un identificativo pubblico
 * del sito (finisce nell'HTML), ma non sta nel repo: arriva dalla variabile di build
 * PUBLIC_CF_ANALYTICS_TOKEN impostata in Cloudflare Pages. Senza token valido non si emette nulla.
 */

export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

/** Token del dashboard Cloudflare: 32 caratteri esadecimali. */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Valore di `data-cf-beacon`, oppure `undefined` se il token manca o non ha il formato giusto. */
export function beaconConfig(token: string | undefined): string | undefined {
  const value = token?.trim().toLowerCase();
  return value && TOKEN_PATTERN.test(value) ? JSON.stringify({ token: value }) : undefined;
}
