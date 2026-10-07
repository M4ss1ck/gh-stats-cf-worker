# GitHub Stats Cloudflare Worker

A Cloudflare Worker that generates dynamic GitHub stats SVG cards, including data from private repositories.

Based on [github-readme-stats](https://github.com/anuraghazra/github-readme-stats)

## Features

- **Stats Card** (`/`) - Shows total stars, commits, PRs, issues, repos, and contribution rank
- **Languages Card** (`/languages`) - Displays top programming languages across all repositories
- **Streak Card** (`/streak`) - Shows current and longest contribution streaks

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- A Cloudflare account
- A GitHub Personal Access Token

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g., "GitHub Stats Worker")
4. Select the following scopes:
   - `repo` - Full control of private repositories (needed to read private repo stats)
   - `read:user` - Read user profile data
5. Click **Generate token**
6. **Copy the token** - you won't be able to see it again!

### 3. Configure Secrets

Set your secrets using Wrangler:

```bash
# Set your GitHub Personal Access Token
wrangler secret put GITHUB_TOKEN
# Paste your token when prompted

# Set your GitHub username
wrangler secret put GITHUB_USERNAME
# Enter your username when prompted
```

### 4. Deploy

```bash
npm run deploy
```

Your worker will be deployed to `https://gh-stats.<your-subdomain>.workers.dev`

## Development

Run locally for testing:

```bash
npm run dev
```

For local development, you can create a `.dev.vars` file (not committed to git):

```
GITHUB_TOKEN=your_github_token_here
GITHUB_USERNAME=your_username_here
```

### Tests

```bash
pnpm test        # vitest, GitHub API is mocked (no token needed)
pnpm typecheck   # tsc
```

## Endpoints

### Stats Card

```
GET /
```

Returns an SVG card with overall GitHub statistics.

### Languages Card

```
GET /languages
```

Returns an SVG card showing top programming languages.

### Streak Card

```
GET /streak
```

Returns an SVG card with contribution streak information.

## Query Parameters

All endpoints support the following parameters:

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `theme` | `dark`, `light`, `dracula`, `nord`, `tokyonight` | `dark` | Color theme |
| `hide_border` | `true`, `false` | `false` | Hide the card border |
| `hide_title` | `true`, `false` | `false` | Hide the card title |

### Stats Card Additional Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `hide_rank` | `true`, `false` | `false` | Hide the rank circle |
| `show_icons` | `true`, `false` | `true` | Show icons next to stats |
| `line_height` | number | `25` | Line height between stats |

### Languages Card Additional Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `layout` | `normal`, `compact`, `donut`, `pie` | `normal` | Card layout style |
| `langs_count` | `1-10` | `6` | Number of languages to show |

## Usage Examples

### In GitHub README

```markdown
![GitHub Stats](https://gh-stats.your-subdomain.workers.dev/)

![Top Languages](https://gh-stats.your-subdomain.workers.dev/languages?layout=compact)

![GitHub Streak](https://gh-stats.your-subdomain.workers.dev/streak)
```

### With Theme

```markdown
![Stats](https://gh-stats.your-subdomain.workers.dev/?theme=dracula)
```

### Compact Languages

```markdown
![Languages](https://gh-stats.your-subdomain.workers.dev/languages?layout=compact&langs_count=8)
```

### Donut Chart

```markdown
![Languages](https://gh-stats.your-subdomain.workers.dev/languages?layout=donut&theme=nord)
```

## Available Themes

- `dark` (default) - GitHub dark theme
- `light` - GitHub light theme
- `dracula` - Dracula theme
- `nord` - Nord theme
- `tokyonight` - Tokyo Night theme

## Caching

Rendered cards are cached at the edge with the Workers Cache API (`caches.default`), so most requests never touch the GitHub API. This matters most for `/languages`, which needs one GraphQL request per 100 repositories and can otherwise be too slow for GitHub's image proxy (camo), which then shows a broken image.

- **Fresh for 1 hour.** Clients get `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`.
- **Stale-while-revalidate.** For up to a day after that, the cached card is served immediately while a new one is rendered in the background. A slow render only happens on the very first request for a card, or after it has gone unused for more than a day.
- **Errors are never cached**, so a GitHub hiccup doesn't stick around.
- **Cache key.** Only the parameters that change a card (`theme`, `layout`, …) are part of the key, sorted. Others such as `utm_*` are ignored.
- **`rebuild`.** Not part of the key, so it doesn't create an entry per value. Changing it (for example `rebuild=2`) forces one fresh render that replaces the cached card. Requests without `rebuild` get whatever is cached.

Responses include an `X-Cache` header (`HIT`, `STALE`, `MISS`, or `BYPASS` for errors). The Cache API does nothing on `*.workers.dev` subdomains, so use a custom domain.

## Project Structure

```
/
├── wrangler.toml          # Cloudflare Worker configuration
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
├── src/
│   ├── index.ts           # Router and main handler
│   ├── github.ts          # GitHub GraphQL API client
│   ├── themes.ts          # Color theme definitions
│   └── cards/
│       ├── stats.ts       # Stats card SVG generator
│       ├── languages.ts   # Languages card SVG generator
│       └── streak.ts      # Streak card SVG generator
└── README.md
```

## License

MIT
