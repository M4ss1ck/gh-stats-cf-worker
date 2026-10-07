import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { CARD_CACHE_CONTROL, type Env } from './index';

const env: Env = { GITHUB_TOKEN: 'token', GITHUB_USERNAME: 'user' };
const BASE = 'https://gh-stats.example.com';

// In-memory stand-in for caches.default, keyed by URL like the real one.
function fakeCache() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: Request) => store.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => {
      store.set(key.url, response.clone());
    }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { store, cache };
}

// GitHub GraphQL stub serving a single page of language data. The languages
// returned can be swapped between calls to tell renders apart.
function fakeGitHub() {
  const state = { language: 'TypeScript', fail: false };
  const fetchMock = vi.fn(async () => {
    if (state.fail) {
      return Response.json({ errors: [{ message: 'boom' }] });
    }
    return Response.json({
      data: {
        user: {
          repositories: {
            nodes: [{ languages: { edges: [{ size: 100, node: { name: state.language, color: '#3178c6' } }] } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, fetchMock };
}

// Runs a request and waits for everything handed to ctx.waitUntil (cache
// writes, background refreshes) to settle, like the runtime does.
async function get(path: string) {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  const response = await worker.fetch(new Request(BASE + path), env, ctx);
  const body = await response.text();
  // waitUntil may be called from inside another waitUntil promise.
  for (let i = 0; i < pending.length; i++) await pending[i];
  return { response, body };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('edge cache', () => {
  it('renders and stores on a miss, then serves hits without calling GitHub', async () => {
    const { store } = fakeCache();
    const { fetchMock } = fakeGitHub();

    const first = await get('/languages?layout=donut&theme=dracula');
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get('X-Cache')).toBe('MISS');
    expect(first.response.headers.get('Cache-Control')).toBe(CARD_CACHE_CONTROL);
    expect(first.body).toContain('TypeScript');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    const second = await get('/languages?layout=donut&theme=dracula');
    expect(second.response.headers.get('X-Cache')).toBe('HIT');
    expect(second.response.headers.get('Cache-Control')).toBe(CARD_CACHE_CONTROL);
    expect(second.response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(second.body).toBe(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not leak internal bookkeeping headers to clients', async () => {
    fakeCache();
    fakeGitHub();

    await get('/languages');
    const hit = await get('/languages');

    expect([...hit.response.headers.keys()].filter((h) => h.startsWith('x-card-'))).toEqual([]);
  });

  it('normalizes the key: param order and unrelated params share one entry', async () => {
    const { store } = fakeCache();
    const { fetchMock } = fakeGitHub();

    await get('/languages?theme=dracula&layout=donut');
    const reordered = await get('/languages?layout=donut&utm_source=x&theme=dracula');

    expect(reordered.response.headers.get('X-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...store.keys()]).toEqual([`${BASE}/languages?layout=donut&theme=dracula`]);
  });

  it('keeps separate entries for params that change the card', async () => {
    const { store } = fakeCache();
    fakeGitHub();

    await get('/languages?theme=dracula');
    const other = await get('/languages?theme=nord');

    expect(other.response.headers.get('X-Cache')).toBe('MISS');
    expect(store.size).toBe(2);
  });

  it('keeps one entry per card across rebuild values, re-rendering when the value changes', async () => {
    const { store } = fakeCache();
    const { state, fetchMock } = fakeGitHub();

    await get('/languages?layout=donut&rebuild=true');
    const same = await get('/languages?layout=donut&rebuild=true');
    expect(same.response.headers.get('X-Cache')).toBe('HIT');

    state.language = 'Rust';
    const bumped = await get('/languages?layout=donut&rebuild=2');
    expect(bumped.response.headers.get('X-Cache')).toBe('MISS');
    expect(bumped.body).toContain('Rust');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The fresh render replaced the old one instead of adding an entry.
    expect(store.size).toBe(1);
    const again = await get('/languages?layout=donut&rebuild=2');
    expect(again.response.headers.get('X-Cache')).toBe('HIT');
    expect(again.body).toContain('Rust');

    // Without `rebuild`, whatever is cached is served.
    const plain = await get('/languages?layout=donut');
    expect(plain.response.headers.get('X-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a stale entry immediately and refreshes it in the background', async () => {
    const { store } = fakeCache();
    const { state, fetchMock } = fakeGitHub();

    await get('/languages?rebuild=true');
    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    state.language = 'Rust';

    const stale = await get('/languages?rebuild=true');
    expect(stale.response.headers.get('X-Cache')).toBe('STALE');
    expect(stale.body).toContain('TypeScript');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(1);

    const refreshed = await get('/languages?rebuild=true');
    expect(refreshed.response.headers.get('X-Cache')).toBe('HIT');
    expect(refreshed.body).toContain('Rust');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches error responses', async () => {
    const { cache, store } = fakeCache();
    const { state, fetchMock } = fakeGitHub();
    state.fail = true;

    const failed = await get('/languages');
    expect(failed.response.status).toBe(500);
    expect(failed.response.headers.get('X-Cache')).toBe('BYPASS');
    expect(failed.response.headers.get('Cache-Control')).toBe('no-cache');
    expect(cache.put).not.toHaveBeenCalled();

    state.fail = false;
    const recovered = await get('/languages');
    expect(recovered.response.status).toBe(200);
    expect(recovered.response.headers.get('X-Cache')).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(1);
  });

  it('keeps the stale entry when a background refresh fails', async () => {
    const { store } = fakeCache();
    const { state } = fakeGitHub();

    await get('/languages');
    vi.setSystemTime(new Date('2026-01-01T02:00:00Z'));
    state.fail = true;

    const stale = await get('/languages');
    expect(stale.response.status).toBe(200);
    expect(stale.response.headers.get('X-Cache')).toBe('STALE');
    expect(stale.body).toContain('TypeScript');
    expect(store.size).toBe(1);
  });

  it('still renders when the cache is unavailable', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => {
          throw new Error('cache down');
        }),
        put: vi.fn(async () => {
          throw new Error('cache down');
        }),
      },
    });
    fakeGitHub();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { response, body } = await get('/languages');
    expect(response.status).toBe(200);
    expect(body).toContain('TypeScript');
  });

  it('does not cache unknown paths', async () => {
    const { cache } = fakeCache();
    fakeGitHub();

    const { response } = await get('/nope');
    expect(response.status).toBe(404);
    expect(cache.match).not.toHaveBeenCalled();
  });
});
