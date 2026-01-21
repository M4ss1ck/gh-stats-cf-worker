import { StreakStats } from '../github';
import { Theme } from '../themes';

interface StreakCardOptions {
  hideBorder: boolean;
  hideTitle: boolean;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'N/A';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (startDate.getTime() === endDate.getTime()) {
    return `${months[startDate.getMonth()]} ${startDate.getDate()}`;
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    if (startDate.getMonth() === endDate.getMonth()) {
      return `${months[startDate.getMonth()]} ${startDate.getDate()} - ${endDate.getDate()}`;
    }
    return `${months[startDate.getMonth()]} ${startDate.getDate()} - ${months[endDate.getMonth()]} ${endDate.getDate()}`;
  }

  return `${months[startDate.getMonth()]} ${startDate.getDate()}, ${startDate.getFullYear()} - ${months[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;
}

export function generateStreakCard(stats: StreakStats, theme: Theme, options: StreakCardOptions): string {
  const width = 495;
  const height = options.hideTitle ? 150 : 175;

  const title = options.hideTitle
    ? ''
    : `<text x="${width / 2}" y="30" class="title" text-anchor="middle">GitHub Contribution Streak</text>`;

  const startY = options.hideTitle ? 30 : 55;

  // Fire icon for streak (16x16, positioned next to the value)
  const fireIcon = `
    <svg x="25" y="8" width="20" height="20" viewBox="0 0 24 24" fill="${theme.ring}">
      <path d="M12 23a7.5 7.5 0 0 1-5.138-12.963C8.204 8.774 11.5 6.5 11 1.5c6 4 9 8 3 14 1 0 2.5 0 5-2.47.27.773.5 1.604.5 2.47A7.5 7.5 0 0 1 12 23z"/>
    </svg>
  `;

  const border = options.hideBorder
    ? ''
    : `<rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${theme.border}"/>`;

  // Three columns: Total Contributions, Current Streak, Longest Streak
  const colWidth = width / 3;

  const totalContribsCol = `
    <g transform="translate(${colWidth * 0.5}, ${startY})">
      <text class="stat-value" x="0" y="30" text-anchor="middle">${stats.totalContributions.toLocaleString()}</text>
      <text class="stat-label" x="0" y="50" text-anchor="middle">Total Contributions</text>
      <text class="date-label" x="0" y="70" text-anchor="middle">Last year</text>
    </g>
  `;

  const currentStreakCol = `
    <g transform="translate(${colWidth * 1.5}, ${startY})">
      ${stats.currentStreak > 0 ? fireIcon : ''}
      <text class="streak-value" x="0" y="30" text-anchor="middle">${stats.currentStreak}</text>
      <text class="stat-label" x="0" y="50" text-anchor="middle">Current Streak</text>
      <text class="date-label" x="0" y="70" text-anchor="middle">${formatDateRange(stats.currentStreakStart, stats.currentStreakEnd)}</text>
    </g>
  `;

  const longestStreakCol = `
    <g transform="translate(${colWidth * 2.5}, ${startY})">
      <text class="stat-value" x="0" y="30" text-anchor="middle">${stats.longestStreak}</text>
      <text class="stat-label" x="0" y="50" text-anchor="middle">Longest Streak</text>
      <text class="date-label" x="0" y="70" text-anchor="middle">${formatDateRange(stats.longestStreakStart, stats.longestStreakEnd)}</text>
    </g>
  `;

  // Divider lines
  const dividers = `
    <line x1="${colWidth}" y1="${startY}" x2="${colWidth}" y2="${startY + 80}" stroke="${theme.border}" stroke-width="1"/>
    <line x1="${colWidth * 2}" y1="${startY}" x2="${colWidth * 2}" y2="${startY + 80}" stroke="${theme.border}" stroke-width="1"/>
  `;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .stat-value { font: 700 28px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .streak-value { font: 700 32px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.ring}; }
    .stat-label { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .date-label { font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.icon}; }
  </style>
  <rect x="0" y="0" rx="4.5" ry="4.5" width="${width}" height="${height}" fill="${theme.background}"/>
  ${border}
  ${title}
  ${dividers}
  ${totalContribsCol}
  ${currentStreakCol}
  ${longestStreakCol}
</svg>
  `.trim();
}
