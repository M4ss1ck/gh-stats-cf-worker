import { fetchUserStats, fetchLanguageStats, fetchStreakStats } from './github';
import { generateStatsCard } from './cards/stats';
import { generateLanguagesCard } from './cards/languages';
import { generateStreakCard } from './cards/streak';
import { getTheme } from './themes';

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_USERNAME: string;
}

interface QueryParams {
  theme: string;
  hide_border: boolean;
  hide_title: boolean;
  hide_rank: boolean;
  show_icons: boolean;
  line_height: number;
  layout: 'compact' | 'normal' | 'donut' | 'pie';
  langs_count: number;
}

function parseQueryParams(url: URL): QueryParams {
  return {
    theme: url.searchParams.get('theme') || 'dark',
    hide_border: url.searchParams.get('hide_border') === 'true',
    hide_title: url.searchParams.get('hide_title') === 'true',
    hide_rank: url.searchParams.get('hide_rank') === 'true',
    show_icons: url.searchParams.get('show_icons') !== 'false', // Default true
    line_height: parseInt(url.searchParams.get('line_height') || '25', 10),
    layout: (url.searchParams.get('layout') as QueryParams['layout']) || 'normal',
    langs_count: Math.min(Math.max(parseInt(url.searchParams.get('langs_count') || '6', 10), 1), 10),
  };
}

// A rendered card is fresh for an hour. After that it may still be served for
// another day while a newer copy is generated in the background.
const FRESH_SECONDS = 3600;
const STALE_SECONDS = 86400;
export const CARD_CACHE_CONTROL = `public, max-age=${FRESH_SECONDS}, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`;

// Bookkeeping headers on the copy stored in caches.default; never sent to clients.
const GENERATED_AT_HEADER = 'X-Card-Generated-At';
const REBUILD_HEADER = 'X-Card-Rebuild';

// The query parameters that change each card's output. Anything else
// (cache busters like `rebuild`, tracking params, typos) is left out of the
// cache key so it can't fragment the cache.
const CARD_PARAMS: Record<string, readonly string[]> = {
  '/': ['theme', 'hide_border', 'hide_title', 'hide_rank', 'show_icons', 'line_height'],
  '/languages': ['theme', 'hide_border', 'hide_title', 'layout', 'langs_count'],
  '/streak': ['theme', 'hide_border', 'hide_title'],
};

function svgResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': CARD_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function errorResponse(message: string, status: number = 500): Response {
  const svg = `
<svg width="400" height="100" viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="400" height="100" rx="4.5" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="399" height="99" rx="4.5" fill="none" stroke="#f85149"/>
  <text x="200" y="40" text-anchor="middle" fill="#f85149" font-family="'Segoe UI', Ubuntu, Sans-Serif" font-size="14" font-weight="600">Error</text>
  <text x="200" y="65" text-anchor="middle" fill="#c9d1d9" font-family="'Segoe UI', Ubuntu, Sans-Serif" font-size="12">${message}</text>
</svg>
  `.trim();

  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleStats(env: Env, params: QueryParams): Promise<Response> {
  const stats = await fetchUserStats(env.GITHUB_TOKEN, env.GITHUB_USERNAME);
  const theme = getTheme(params.theme);
  const svg = generateStatsCard(stats, theme, {
    hideBorder: params.hide_border,
    hideTitle: params.hide_title,
    hideRank: params.hide_rank,
    showIcons: params.show_icons,
    lineHeight: params.line_height,
  });
  return svgResponse(svg);
}

async function handleLanguages(env: Env, params: QueryParams): Promise<Response> {
  const languages = await fetchLanguageStats(env.GITHUB_TOKEN, env.GITHUB_USERNAME);
  const theme = getTheme(params.theme);
  const svg = generateLanguagesCard(languages, theme, {
    hideBorder: params.hide_border,
    hideTitle: params.hide_title,
    layout: params.layout,
    langsCount: params.langs_count,
  });
  return svgResponse(svg);
}

async function handleStreak(env: Env, params: QueryParams): Promise<Response> {
  const streak = await fetchStreakStats(env.GITHUB_TOKEN, env.GITHUB_USERNAME);
  const theme = getTheme(params.theme);
  const svg = generateStreakCard(streak, theme, {
    hideBorder: params.hide_border,
    hideTitle: params.hide_title,
  });
  return svgResponse(svg);
}

async function renderCard(pathname: string, env: Env, params: QueryParams): Promise<Response> {
  try {
    switch (pathname) {
      case '/':
        return await handleStats(env, params);
      case '/languages':
        return await handleLanguages(env, params);
      case '/streak':
        return await handleStreak(env, params);
      default:
        return errorResponse('Not Found: Use /, /languages, or /streak', 404);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating card:', message);
    return errorResponse(message.substring(0, 60), 500);
  }
}

// One cache entry per (path, card-affecting params), with params sorted so
// `?a=1&b=2` and `?b=2&a=1` share an entry.
function cacheKey(url: URL, cardParams: readonly string[]): Request {
  const key = new URL(url.pathname, url.origin);
  for (const name of [...cardParams].sort()) {
    const value = url.searchParams.get(name);
    if (value !== null) key.searchParams.set(name, value);
  }
  return new Request(key.toString(), { method: 'GET' });
}

async function storeCard(cache: Cache, key: Request, response: Response, rebuild: string): Promise<void> {
  const headers = new Headers(response.headers);
  // Keep the entry through the stale window; freshness is judged from
  // GENERATED_AT_HEADER on read, not by the cache's own expiry.
  headers.set('Cache-Control', `public, max-age=${FRESH_SECONDS + STALE_SECONDS}`);
  headers.set(GENERATED_AT_HEADER, String(Date.now()));
  headers.set(REBUILD_HEADER, rebuild);
  await cache.put(key, new Response(response.body, { status: response.status, headers }));
}

// Renders a card and, if it succeeded, schedules it to be cached. Error
// responses are returned as-is and never stored.
async function renderAndStore(
  pathname: string,
  env: Env,
  params: QueryParams,
  cache: Cache,
  key: Request,
  rebuild: string,
  ctx: ExecutionContext
): Promise<Response> {
  const response = await renderCard(pathname, env, params);
  if (response.status === 200) {
    ctx.waitUntil(
      storeCard(cache, key, response.clone(), rebuild).catch((error) => {
        console.error('Error caching card:', error instanceof Error ? error.message : error);
      })
    );
  }
  return response;
}

function fromCache(cached: Response, status: 'HIT' | 'STALE'): Response {
  const headers = new Headers(cached.headers);
  headers.set('Cache-Control', CARD_CACHE_CONTROL);
  headers.delete(GENERATED_AT_HEADER);
  headers.delete(REBUILD_HEADER);
  headers.set('X-Cache', status);
  return new Response(cached.body, { status: cached.status, headers });
}

function withCacheStatus(response: Response, status: 'MISS' | 'BYPASS'): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Cache', status);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const params = parseQueryParams(url);

    // Validate environment
    if (!env.GITHUB_TOKEN) {
      return errorResponse('GITHUB_TOKEN not configured', 500);
    }
    if (!env.GITHUB_USERNAME) {
      return errorResponse('GITHUB_USERNAME not configured', 500);
    }

    const cardParams = CARD_PARAMS[pathname];
    if (!cardParams) {
      return errorResponse('Not Found: Use /, /languages, or /streak', 404);
    }

    // `rebuild` is not part of the key. Instead the entry remembers the value it
    // was rendered for, and a request carrying a different value forces a fresh
    // render that replaces the entry. Requests without `rebuild` take whatever
    // is cached.
    const requestedRebuild = url.searchParams.get('rebuild');
    const cache = caches.default;
    const key = cacheKey(url, cardParams);

    let cached: Response | undefined;
    try {
      cached = await cache.match(key);
    } catch (error) {
      console.error('Error reading cache:', error instanceof Error ? error.message : error);
    }

    if (cached) {
      const cachedRebuild = cached.headers.get(REBUILD_HEADER) ?? '';
      if (requestedRebuild === null || requestedRebuild === cachedRebuild) {
        const age = Date.now() - Number(cached.headers.get(GENERATED_AT_HEADER) ?? 0);
        if (age < FRESH_SECONDS * 1000) {
          return fromCache(cached, 'HIT');
        }
        // Stale: answer now, refresh in the background so the next viewer gets
        // a fresh card without ever waiting on GitHub.
        ctx.waitUntil(renderAndStore(pathname, env, params, cache, key, cachedRebuild, ctx));
        return fromCache(cached, 'STALE');
      }
    }

    const response = await renderAndStore(pathname, env, params, cache, key, requestedRebuild ?? '', ctx);
    return withCacheStatus(response, response.status === 200 ? 'MISS' : 'BYPASS');
  },
};
