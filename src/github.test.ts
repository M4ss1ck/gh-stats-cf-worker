import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLanguageStats, LANGUAGES_PER_REPO } from './github';

// Values GitHub accepts for RepositoryOrder.field. Anything else is rejected
// with a GraphQL error, which is what broke /languages past 100 repos.
const REPOSITORY_ORDER_FIELDS = ['CREATED_AT', 'UPDATED_AT', 'PUSHED_AT', 'NAME', 'STARGAZERS'];

type Edge = { size: number; node: { name: string; color: string | null } };
type Page = { repos: Edge[][]; hasNextPage: boolean; endCursor: string | null };

interface Call {
  order: string | undefined;
  cursor: unknown;
}

// Minimal stand-in for the GitHub GraphQL endpoint: validates the repository
// orderBy field, then serves `pages` in sequence keyed by cursor.
function fakeGitHub(pages: Page[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(init.body as string);
    const order = /repositories\([^)]*orderBy:\s*\{[^}]*field:\s*(\w+)/.exec(query)?.[1];
    calls.push({ order, cursor: variables.cursor });

    if (!order || !REPOSITORY_ORDER_FIELDS.includes(order)) {
      return Response.json({
        errors: [
          {
            message: `Argument 'field' on InputObject 'RepositoryOrder' has an invalid value (${order}). Expected type 'RepositoryOrderField!'.`,
          },
        ],
      });
    }

    const index = variables.cursor == null ? 0 : pages.findIndex((_, i) => pages[i - 1]?.endCursor === variables.cursor);
    const page = pages[index];
    if (!page) {
      return Response.json({ errors: [{ message: `unknown cursor ${variables.cursor}` }] });
    }

    return Response.json({
      data: {
        user: {
          repositories: {
            nodes: page.repos.map((edges) => ({ languages: { edges } })),
            pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
          },
        },
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const lang = (name: string, size: number, color: string | null = '#000000'): Edge => ({
  size,
  node: { name, color },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLanguageStats', () => {
  it('aggregates a single page', async () => {
    fakeGitHub([
      {
        repos: [[lang('TypeScript', 300), lang('CSS', 100)], [lang('TypeScript', 600)]],
        hasNextPage: false,
        endCursor: 'c1',
      },
    ]);

    const result = await fetchLanguageStats('token', 'user');

    expect(result.map((l) => [l.name, l.size])).toEqual([
      ['TypeScript', 900],
      ['CSS', 100],
    ]);
    expect(result[0].percentage).toBeCloseTo(90);
  });

  // Regression: page 2 used `orderBy: {field: SIZE}`, which GitHub rejects,
  // so any account with more than 100 non-fork repos got an error card.
  it('paginates past 100 repos with a valid, consistent ordering', async () => {
    const calls = fakeGitHub([
      { repos: [[lang('TypeScript', 500)]], hasNextPage: true, endCursor: 'c1' },
      { repos: [[lang('Go', 300), lang('TypeScript', 100)]], hasNextPage: true, endCursor: 'c2' },
      { repos: [[lang('Rust', 100, null)]], hasNextPage: false, endCursor: 'c3' },
    ]);

    const result = await fetchLanguageStats('token', 'user');

    expect(calls.map((c) => c.cursor)).toEqual([null, 'c1', 'c2']);
    // A cursor is only valid for the ordering that produced it.
    expect(new Set(calls.map((c) => c.order)).size).toBe(1);
    expect(result.map((l) => [l.name, l.size, l.color])).toEqual([
      ['TypeScript', 600, '#000000'],
      ['Go', 300, '#000000'],
      ['Rust', 100, '#858585'],
    ]);
  });

  it('asks GitHub only for the fields it aggregates', async () => {
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        queries.push(JSON.parse(init.body as string).query);
        return Response.json({
          data: { user: { repositories: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } },
        });
      })
    );

    await fetchLanguageStats('token', 'user');

    const query = queries[0].replace(/\s+/g, ' ');
    expect(query).toContain(`languages(first: ${LANGUAGES_PER_REPO},`);
    expect(LANGUAGES_PER_REPO).toBeLessThan(10);
    expect(query).toContain('edges { size node { name color } }');
  });

  it('surfaces GraphQL errors instead of returning partial data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ errors: [{ message: 'boom' }] }))
    );

    await expect(fetchLanguageStats('token', 'user')).rejects.toThrow('GraphQL error: boom');
  });
});
