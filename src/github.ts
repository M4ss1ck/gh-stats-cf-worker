const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export interface GitHubStats {
  username: string;
  name: string;
  avatarUrl: string;
  totalStars: number;
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  totalRepos: number;
  contributedTo: number;
}

export interface LanguageStats {
  name: string;
  size: number;
  color: string;
  percentage: number;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalContributions: number;
  currentStreakStart: string | null;
  currentStreakEnd: string | null;
  longestStreakStart: string | null;
  longestStreakEnd: string | null;
}

interface ContributionDay {
  contributionCount: number;
  date: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

async function graphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'gh-stats-cf-worker',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  return json.data as T;
}

export async function fetchUserStats(token: string, username: string): Promise<GitHubStats> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const fromDate = oneYearAgo.toISOString();
  const toDate = now.toISOString();

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        name
        avatarUrl
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          restrictedContributionsCount
        }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
          totalCount
        }
        pullRequests(first: 1) {
          totalCount
        }
        issues(first: 1) {
          totalCount
        }
        repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}) {
          totalCount
          nodes {
            stargazerCount
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  interface UserStatsResponse {
    user: {
      name: string | null;
      avatarUrl: string;
      contributionsCollection: {
        totalCommitContributions: number;
        restrictedContributionsCount: number;
      };
      repositoriesContributedTo: { totalCount: number };
      pullRequests: { totalCount: number };
      issues: { totalCount: number };
      repositories: {
        totalCount: number;
        nodes: Array<{ stargazerCount: number }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  }

  const data = await graphqlRequest<UserStatsResponse>(token, query, {
    username,
    from: fromDate,
    to: toDate,
  });

  const user = data.user;
  let totalStars = user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);

  // Fetch more repos if there are more than 100
  let hasNextPage = user.repositories.pageInfo.hasNextPage;
  let cursor = user.repositories.pageInfo.endCursor;

  while (hasNextPage) {
    const moreStars = await fetchMoreStars(token, username, cursor);
    totalStars += moreStars.stars;
    hasNextPage = moreStars.hasNextPage;
    cursor = moreStars.endCursor;
  }

  return {
    username,
    name: user.name || username,
    avatarUrl: user.avatarUrl,
    totalStars,
    totalCommits:
      user.contributionsCollection.totalCommitContributions +
      user.contributionsCollection.restrictedContributionsCount,
    totalPRs: user.pullRequests.totalCount,
    totalIssues: user.issues.totalCount,
    totalRepos: user.repositories.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
}

async function fetchMoreStars(
  token: string,
  username: string,
  cursor: string | null
): Promise<{ stars: number; hasNextPage: boolean; endCursor: string | null }> {
  const query = `
    query($username: String!, $cursor: String) {
      user(login: $username) {
        repositories(first: 100, ownerAffiliations: OWNER, after: $cursor, orderBy: {direction: DESC, field: STARGAZERS}) {
          nodes {
            stargazerCount
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  interface MoreStarsResponse {
    user: {
      repositories: {
        nodes: Array<{ stargazerCount: number }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  }

  const data = await graphqlRequest<MoreStarsResponse>(token, query, { username, cursor });
  const repos = data.user.repositories;

  return {
    stars: repos.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    hasNextPage: repos.pageInfo.hasNextPage,
    endCursor: repos.pageInfo.endCursor,
  };
}

// Every page must use the same query and orderBy: a cursor is only valid for
// the ordering that produced it.
const LANGUAGES_QUERY = `
  query($username: String!, $cursor: String) {
    user(login: $username) {
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, after: $cursor, orderBy: {direction: DESC, field: PUSHED_AT}) {
        nodes {
          languages(first: 10, orderBy: {direction: DESC, field: SIZE}) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export async function fetchLanguageStats(token: string, username: string): Promise<LanguageStats[]> {
  interface LanguageEdge {
    size: number;
    node: { name: string; color: string | null };
  }

  interface LanguageStatsResponse {
    user: {
      repositories: {
        nodes: Array<{
          languages: {
            edges: LanguageEdge[];
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  }

  // Aggregate languages across all repos
  const languageMap = new Map<string, { size: number; color: string }>();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: LanguageStatsResponse = await graphqlRequest<LanguageStatsResponse>(token, LANGUAGES_QUERY, {
      username,
      cursor,
    });

    for (const repo of data.user.repositories.nodes) {
      for (const edge of repo.languages.edges) {
        const name = edge.node.name;
        const existing = languageMap.get(name);
        if (existing) {
          existing.size += edge.size;
        } else {
          languageMap.set(name, {
            size: edge.size,
            color: edge.node.color || '#858585',
          });
        }
      }
    }

    hasNextPage = data.user.repositories.pageInfo.hasNextPage;
    cursor = data.user.repositories.pageInfo.endCursor;
  }

  // Convert to array, sort by size, and calculate percentages
  const totalSize = Array.from(languageMap.values()).reduce((sum, lang) => sum + lang.size, 0);
  const languages: LanguageStats[] = Array.from(languageMap.entries())
    .map(([name, info]) => ({
      name,
      size: info.size,
      color: info.color,
      percentage: totalSize > 0 ? (info.size / totalSize) * 100 : 0,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 10); // Top 10 languages

  return languages;
}

export async function fetchStreakStats(token: string, username: string): Promise<StreakStats> {
  // Fetch contribution calendar for the last year
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  interface StreakStatsResponse {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: ContributionWeek[];
        };
      };
    };
  }

  const data = await graphqlRequest<StreakStatsResponse>(token, query, { username });

  const calendar = data.user.contributionsCollection.contributionCalendar;

  // Flatten all contribution days
  const allDays: ContributionDay[] = calendar.weeks.flatMap((week) => week.contributionDays);

  // Sort by date
  allDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate streaks
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let currentStreakStart: string | null = null;
  let currentStreakEnd: string | null = null;
  let longestStreakStart: string | null = null;
  let longestStreakEnd: string | null = null;
  let tempStreakStart: string | null = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (let i = 0; i < allDays.length; i++) {
    const day = allDays[i];
    const dayDate = new Date(day.date);
    dayDate.setHours(0, 0, 0, 0);

    if (day.contributionCount > 0) {
      if (tempStreak === 0) {
        tempStreakStart = day.date;
      }
      tempStreak++;

      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStreakStart = tempStreakStart;
        longestStreakEnd = day.date;
      }

      // Check if this day is today or yesterday (for current streak)
      if (dayDate.getTime() === today.getTime() || dayDate.getTime() === yesterday.getTime()) {
        // Walk backward to find current streak
        let streakCount = 0;
        let streakStart: string | null = null;
        let streakEnd: string | null = null;

        for (let j = i; j >= 0; j--) {
          const checkDay = allDays[j];
          const checkDate = new Date(checkDay.date);
          checkDate.setHours(0, 0, 0, 0);

          // Check if there's a gap
          if (j < i) {
            const prevDate = new Date(allDays[j + 1].date);
            prevDate.setHours(0, 0, 0, 0);
            const expectedDate = new Date(prevDate);
            expectedDate.setDate(expectedDate.getDate() - 1);

            if (checkDate.getTime() !== expectedDate.getTime()) {
              break;
            }
          }

          if (checkDay.contributionCount > 0) {
            streakCount++;
            streakStart = checkDay.date;
            if (!streakEnd) {
              streakEnd = checkDay.date;
            }
          } else {
            break;
          }
        }

        if (streakCount > currentStreak) {
          currentStreak = streakCount;
          currentStreakStart = streakStart;
          currentStreakEnd = streakEnd;
        }
      }
    } else {
      tempStreak = 0;
      tempStreakStart = null;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalContributions: calendar.totalContributions,
    currentStreakStart,
    currentStreakEnd,
    longestStreakStart,
    longestStreakEnd,
  };
}
