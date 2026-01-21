import { GitHubStats } from '../github';
import { Theme } from '../themes';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

interface StatsCardOptions {
  hideBorder: boolean;
  hideTitle: boolean;
  hideRank: boolean;
  showIcons: boolean;
  lineHeight: number;
}

const icons = {
  star: `<path fill-rule="evenodd" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>`,
  commit: `<path fill-rule="evenodd" d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z"/>`,
  pr: `<path fill-rule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>`,
  issue: `<path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/><path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"/>`,
  repo: `<path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>`,
  contrib: `<path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>`,
};

function calculateRank(stats: GitHubStats): { level: string; percentile: number } {
  // Simple rank calculation based on activity
  const score =
    stats.totalStars * 2 +
    stats.totalCommits +
    stats.totalPRs * 3 +
    stats.totalIssues +
    stats.contributedTo * 2;

  if (score >= 10000) return { level: 'S+', percentile: 1 };
  if (score >= 5000) return { level: 'S', percentile: 5 };
  if (score >= 2500) return { level: 'A++', percentile: 10 };
  if (score >= 1000) return { level: 'A+', percentile: 15 };
  if (score >= 500) return { level: 'A', percentile: 25 };
  if (score >= 250) return { level: 'B+', percentile: 35 };
  if (score >= 100) return { level: 'B', percentile: 50 };
  if (score >= 50) return { level: 'C+', percentile: 65 };
  if (score >= 25) return { level: 'C', percentile: 80 };
  return { level: 'D', percentile: 100 };
}

export function generateStatsCard(stats: GitHubStats, theme: Theme, options: StatsCardOptions): string {
  const width = 495;
  const height = options.hideTitle ? 170 : 195;
  const rank = calculateRank(stats);

  const statItems = [
    { icon: 'star', label: 'Total Stars Earned', value: stats.totalStars },
    { icon: 'commit', label: 'Total Commits (last year)', value: stats.totalCommits },
    { icon: 'pr', label: 'Total PRs', value: stats.totalPRs },
    { icon: 'issue', label: 'Total Issues', value: stats.totalIssues },
    { icon: 'repo', label: 'Total Repos', value: stats.totalRepos },
    { icon: 'contrib', label: 'Contributed To', value: stats.contributedTo },
  ];

  const statY = options.hideTitle ? 25 : 55;

  let statsContent = '';
  statItems.forEach((item, index) => {
    const y = statY + index * options.lineHeight;
    const iconHtml = options.showIcons
      ? `<svg x="25" y="${y - 12}" width="16" height="16" viewBox="0 0 16 16" fill="${theme.icon}">${icons[item.icon as keyof typeof icons]}</svg>`
      : '';
    const textX = options.showIcons ? 48 : 25;

    statsContent += `
      <g transform="translate(0, 0)">
        ${iconHtml}
        <text x="${textX}" y="${y}" class="stat-label">${escapeXml(item.label)}:</text>
        <text x="220" y="${y}" class="stat-value">${formatNumber(item.value)}</text>
      </g>
    `;
  });

  const rankCircle = options.hideRank
    ? ''
    : `
    <g transform="translate(400, ${height / 2})">
      <circle r="40" fill="none" stroke="${theme.ring}" stroke-width="5" stroke-dasharray="251.2" stroke-dashoffset="${251.2 * (rank.percentile / 100)}" transform="rotate(-90)"/>
      <text class="rank-text" x="0" y="0" text-anchor="middle" dominant-baseline="central">${rank.level}</text>
      <text class="rank-percentile" x="0" y="20" text-anchor="middle">Top ${rank.percentile}%</text>
    </g>
  `;

  const title = options.hideTitle
    ? ''
    : `<text x="25" y="35" class="title">${escapeXml(stats.name)}'s GitHub Stats</text>`;

  const border = options.hideBorder
    ? ''
    : `<rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${theme.border}"/>`;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .stat-label { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .stat-value { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .rank-text { font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.rankText}; }
    .rank-percentile { font: 400 10px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.icon}; }
  </style>
  <rect x="0" y="0" rx="4.5" ry="4.5" width="${width}" height="${height}" fill="${theme.background}"/>
  ${border}
  ${title}
  ${statsContent}
  ${rankCircle}
</svg>
  `.trim();
}
