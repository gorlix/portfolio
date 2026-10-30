/*
 * Stelle dei repository (PORT-89), lette dall'API GitHub una volta sola, al build: nel browser la
 * CSP non lo permette e non serve. Se GitHub non risponde (rete, limite di richieste) valgono le
 * stelle di riserva nei dati: la build non deve mai rompersi per questo.
 * Una richiesta per proprietario, non una per repository: senza token il limite e di 60 l'ora.
 */

export interface RepoRef {
  owner: string;
  name: string;
}

/** Proprietario e nome da un link a GitHub, anche a una pagina interna (es. una pull request). */
export function repoOf(url: string): RepoRef | null {
  const { hostname, pathname } = new URL(url);
  if (hostname !== 'github.com') return null;
  const [owner, name] = pathname.split('/').filter(Boolean);
  return owner && name ? { owner, name } : null;
}

const keyOf = ({ owner, name }: RepoRef): string => `${owner}/${name}`.toLowerCase();

const TIMEOUT_MS = 5000;
/** Un proprietario con piu repository di una pagina resterebbe sulle stelle di riserva. */
const PER_PAGE = 100;

/** Stelle di tutti i repository di `owner`, per chiave `proprietario/nome`; vuoto se fallisce. */
export async function ownerStars(
  owner: string,
  token: string | undefined,
  get: typeof fetch = fetch,
): Promise<Map<string, number>> {
  const url = `https://api.github.com/users/${owner}/repos?per_page=${PER_PAGE}&type=owner`;
  try {
    const response = await get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'portfolio-build',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const repos = (await response.json()) as { name: string; stargazers_count: number }[];
    return new Map(repos.map((r) => [keyOf({ owner, name: r.name }), r.stargazers_count]));
  } catch (error) {
    console.warn(`github-stars: ${owner}: uso le stelle di riserva (${String(error)})`);
    return new Map();
  }
}

/** Stelle dei repository indicati: il dato di GitHub o, se manca, quello di riserva. */
export async function resolveStars(
  repos: readonly { url: string; fallback: number }[],
  token: string | undefined,
  get: typeof fetch = fetch,
): Promise<number[]> {
  const refs = repos.map((r) => repoOf(r.url));
  const owners = [...new Set(refs.flatMap((r) => (r ? [r.owner] : [])))];
  const found = await Promise.all(owners.map((o) => ownerStars(o, token, get)));
  const stars = new Map(found.flatMap((m) => [...m]));
  return repos.map((r, i) => {
    const ref = refs[i];
    return (ref && stars.get(keyOf(ref))) ?? r.fallback;
  });
}
