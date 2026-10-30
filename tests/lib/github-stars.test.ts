import { describe, expect, it, vi } from 'vitest';
import { repoOf, resolveStars } from '../../src/lib/github-stars';

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('stelle dei repository', () => {
  it('riconosce il repository anche da un link interno', () => {
    expect(repoOf('https://github.com/Paca-AI/paca/pull/454')).toEqual({
      owner: 'Paca-AI',
      name: 'paca',
    });
    expect(repoOf('https://example.com/a/b')).toBeNull();
  });

  it('fa una richiesta per proprietario e usa il dato di GitHub, anche se zero', async () => {
    const get = vi.fn(async () =>
      reply([
        { name: 'One', stargazers_count: 7 },
        { name: 'two', stargazers_count: 0 },
      ]),
    ) as unknown as typeof fetch;
    const stars = await resolveStars(
      [
        { url: 'https://github.com/gorlix/one', fallback: 1 },
        { url: 'https://github.com/gorlix/two', fallback: 3 },
      ],
      undefined,
      get,
    );
    expect(stars).toEqual([7, 0]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('manda il token solo se esiste', async () => {
    const get = vi.fn(async (_url: string, _init: RequestInit) => reply([]));
    await resolveStars(
      [{ url: 'https://github.com/gorlix/one', fallback: 1 }],
      'secret',
      get as unknown as typeof fetch,
    );
    const headers = get.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('se GitHub non risponde valgono le stelle di riserva, senza errori', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const down = vi.fn(async () => reply({}, 403)) as unknown as typeof fetch;
    const off = vi.fn(async () => {
      throw new Error('rete');
    }) as unknown as typeof fetch;
    const repos = [{ url: 'https://github.com/gorlix/one', fallback: 4 }];
    expect(await resolveStars(repos, undefined, down)).toEqual([4]);
    expect(await resolveStars(repos, undefined, off)).toEqual([4]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
