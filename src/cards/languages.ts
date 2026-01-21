import { LanguageStats } from '../github';
import { Theme } from '../themes';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LanguagesCardOptions {
  hideBorder: boolean;
  hideTitle: boolean;
  layout: 'compact' | 'normal' | 'donut' | 'pie';
  langsCount: number;
}

export function generateLanguagesCard(
  languages: LanguageStats[],
  theme: Theme,
  options: LanguagesCardOptions
): string {
  const displayLangs = languages.slice(0, options.langsCount);

  if (options.layout === 'compact') {
    return generateCompactCard(displayLangs, theme, options);
  } else if (options.layout === 'donut' || options.layout === 'pie') {
    return generateDonutCard(displayLangs, theme, options);
  }

  return generateNormalCard(displayLangs, theme, options);
}

function generateNormalCard(languages: LanguageStats[], theme: Theme, options: LanguagesCardOptions): string {
  const width = 300;
  const height = options.hideTitle ? 45 + languages.length * 40 : 70 + languages.length * 40;

  const title = options.hideTitle
    ? ''
    : `<text x="25" y="35" class="title">Most Used Languages</text>`;

  const startY = options.hideTitle ? 25 : 55;

  let langsContent = '';
  languages.forEach((lang, index) => {
    const y = startY + index * 40;
    langsContent += `
      <g transform="translate(25, ${y})">
        <circle cx="6" cy="6" r="6" fill="${lang.color}"/>
        <text x="20" y="10" class="lang-name">${escapeXml(lang.name)}</text>
        <text x="250" y="10" class="lang-percent" text-anchor="end">${lang.percentage.toFixed(2)}%</text>
        <rect x="0" y="18" width="250" height="8" rx="4" fill="${theme.progressBarBg}"/>
        <rect x="0" y="18" width="${(lang.percentage / 100) * 250}" height="8" rx="4" fill="${lang.color}"/>
      </g>
    `;
  });

  const border = options.hideBorder
    ? ''
    : `<rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${theme.border}"/>`;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .lang-name { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .lang-percent { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
  </style>
  <rect x="0" y="0" rx="4.5" ry="4.5" width="${width}" height="${height}" fill="${theme.background}"/>
  ${border}
  ${title}
  ${langsContent}
</svg>
  `.trim();
}

function generateCompactCard(languages: LanguageStats[], theme: Theme, options: LanguagesCardOptions): string {
  const width = 300;
  const height = options.hideTitle ? 100 : 125;

  const title = options.hideTitle
    ? ''
    : `<text x="25" y="35" class="title">Most Used Languages</text>`;

  const startY = options.hideTitle ? 25 : 55;

  // Progress bar with segments
  let progressOffset = 0;
  let progressBars = '';
  languages.forEach((lang) => {
    const barWidth = (lang.percentage / 100) * 250;
    progressBars += `<rect x="${25 + progressOffset}" y="${startY}" width="${barWidth}" height="8" fill="${lang.color}" rx="${progressOffset === 0 ? 4 : 0}"/>`;
    progressOffset += barWidth;
  });

  // Legend
  const cols = 2;
  let legendContent = '';
  languages.forEach((lang, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 25 + col * 130;
    const y = startY + 25 + row * 20;

    legendContent += `
      <g transform="translate(${x}, ${y})">
        <circle cx="6" cy="6" r="5" fill="${lang.color}"/>
        <text x="16" y="10" class="legend-text">${escapeXml(lang.name)} ${lang.percentage.toFixed(1)}%</text>
      </g>
    `;
  });

  const border = options.hideBorder
    ? ''
    : `<rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${theme.border}"/>`;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .legend-text { font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
  </style>
  <rect x="0" y="0" rx="4.5" ry="4.5" width="${width}" height="${height}" fill="${theme.background}"/>
  ${border}
  ${title}
  <rect x="25" y="${startY}" width="250" height="8" rx="4" fill="${theme.progressBarBg}"/>
  ${progressBars}
  ${legendContent}
</svg>
  `.trim();
}

function generateDonutCard(languages: LanguageStats[], theme: Theme, options: LanguagesCardOptions): string {
  const width = 300;
  const height = options.hideTitle ? 170 : 195;

  const title = options.hideTitle
    ? ''
    : `<text x="25" y="35" class="title">Most Used Languages</text>`;

  const centerX = 85;
  const centerY = options.hideTitle ? 85 : 110;
  const radius = 50;
  const innerRadius = options.layout === 'donut' ? 30 : 0;

  // Create donut/pie segments
  let segments = '';
  let angle = -90; // Start from top

  languages.forEach((lang) => {
    const sliceAngle = (lang.percentage / 100) * 360;
    const startAngle = angle;
    const endAngle = angle + sliceAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;

    if (options.layout === 'donut') {
      const ix1 = centerX + innerRadius * Math.cos(startRad);
      const iy1 = centerY + innerRadius * Math.sin(startRad);
      const ix2 = centerX + innerRadius * Math.cos(endRad);
      const iy2 = centerY + innerRadius * Math.sin(endRad);

      segments += `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${lang.color}"/>`;
    } else {
      segments += `<path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${lang.color}"/>`;
    }

    angle = endAngle;
  });

  // Legend on the right
  let legendContent = '';
  const legendStartY = options.hideTitle ? 25 : 50;
  languages.slice(0, 6).forEach((lang, index) => {
    const y = legendStartY + index * 22;
    legendContent += `
      <g transform="translate(160, ${y})">
        <circle cx="6" cy="6" r="5" fill="${lang.color}"/>
        <text x="16" y="10" class="legend-text">${escapeXml(lang.name)}</text>
        <text x="130" y="10" class="legend-percent" text-anchor="end">${lang.percentage.toFixed(1)}%</text>
      </g>
    `;
  });

  const border = options.hideBorder
    ? ''
    : `<rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${theme.border}"/>`;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .legend-text { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .legend-percent { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
  </style>
  <rect x="0" y="0" rx="4.5" ry="4.5" width="${width}" height="${height}" fill="${theme.background}"/>
  ${border}
  ${title}
  <g>
    ${segments}
  </g>
  ${legendContent}
</svg>
  `.trim();
}
