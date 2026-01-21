export interface Theme {
  background: string;
  border: string;
  title: string;
  text: string;
  icon: string;
  ring: string;
  rankCircle: string;
  rankText: string;
  progressBar: string;
  progressBarBg: string;
}

export const themes: Record<string, Theme> = {
  dark: {
    background: '#0d1117',
    border: '#30363d',
    title: '#58a6ff',
    text: '#c9d1d9',
    icon: '#8b949e',
    ring: '#58a6ff',
    rankCircle: '#58a6ff',
    rankText: '#c9d1d9',
    progressBar: '#58a6ff',
    progressBarBg: '#21262d',
  },
  light: {
    background: '#ffffff',
    border: '#e4e2e2',
    title: '#0366d6',
    text: '#24292e',
    icon: '#586069',
    ring: '#0366d6',
    rankCircle: '#0366d6',
    rankText: '#24292e',
    progressBar: '#0366d6',
    progressBarBg: '#e1e4e8',
  },
  dracula: {
    background: '#282a36',
    border: '#44475a',
    title: '#ff79c6',
    text: '#f8f8f2',
    icon: '#bd93f9',
    ring: '#ff79c6',
    rankCircle: '#bd93f9',
    rankText: '#f8f8f2',
    progressBar: '#ff79c6',
    progressBarBg: '#44475a',
  },
  nord: {
    background: '#2e3440',
    border: '#4c566a',
    title: '#88c0d0',
    text: '#eceff4',
    icon: '#81a1c1',
    ring: '#88c0d0',
    rankCircle: '#88c0d0',
    rankText: '#eceff4',
    progressBar: '#88c0d0',
    progressBarBg: '#3b4252',
  },
  tokyonight: {
    background: '#1a1b26',
    border: '#414868',
    title: '#70a5fd',
    text: '#a9b1d6',
    icon: '#9ece6a',
    ring: '#70a5fd',
    rankCircle: '#bb9af7',
    rankText: '#a9b1d6',
    progressBar: '#70a5fd',
    progressBarBg: '#24283b',
  },
};

export function getTheme(name: string = 'dark'): Theme {
  return themes[name.toLowerCase()] || themes.dark;
}
