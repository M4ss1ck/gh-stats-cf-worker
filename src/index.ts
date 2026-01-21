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

function svgResponse(svg: string, cacheSeconds: number = 3600): Response {
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': `public, max-age=${cacheSeconds}`,
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
  },
};
