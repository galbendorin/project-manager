export const DEFAULT_ACCENT_THEME = 'orchid';
export const ACCENT_THEME_STORAGE_KEY = 'pm_accent_theme_v1';

export const ACCENT_THEMES = {
  orchid: {
    key: 'orchid',
    label: 'Orchid',
    accent: '#7c3aed',
    strong: '#5b21b6',
    soft: '#e9ddff',
    tint: '#f6f1ff',
    gradient: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 52%, #ec4899 100%)',
    themeColor: '#7c3aed',
  },
  ocean: {
    key: 'ocean',
    label: 'Ocean',
    accent: '#2563eb',
    strong: '#1d4ed8',
    soft: '#dbeafe',
    tint: '#eef5ff',
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 58%, #22c55e 100%)',
    themeColor: '#2563eb',
  },
  emerald: {
    key: 'emerald',
    label: 'Emerald',
    accent: '#059669',
    strong: '#047857',
    soft: '#d1fae5',
    tint: '#ecfdf5',
    gradient: 'linear-gradient(135deg, #047857 0%, #10b981 56%, #34d399 100%)',
    themeColor: '#059669',
  },
  sunset: {
    key: 'sunset',
    label: 'Sunset',
    accent: '#ea580c',
    strong: '#c2410c',
    soft: '#ffedd5',
    tint: '#fff7ed',
    gradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 52%, #fb7185 100%)',
    themeColor: '#ea580c',
  },
  rose: {
    key: 'rose',
    label: 'Rose',
    accent: '#e11d48',
    strong: '#be123c',
    soft: '#ffe4eb',
    tint: '#fff1f5',
    gradient: 'linear-gradient(135deg, #be123c 0%, #db2777 52%, #8b5cf6 100%)',
    themeColor: '#e11d48',
  },
};

export const getAccentTheme = (themeKey) => (
  ACCENT_THEMES[themeKey] || ACCENT_THEMES[DEFAULT_ACCENT_THEME]
);

export const loadAccentTheme = () => {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_THEME;

  try {
    const stored = window.localStorage.getItem(ACCENT_THEME_STORAGE_KEY);
    return ACCENT_THEMES[stored] ? stored : DEFAULT_ACCENT_THEME;
  } catch {
    return DEFAULT_ACCENT_THEME;
  }
};

export const saveAccentTheme = (themeKey) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(ACCENT_THEME_STORAGE_KEY, themeKey);
  } catch {
    // Ignore localStorage write failures.
  }
};

export const applyAccentTheme = (themeKey) => {
  if (typeof document === 'undefined') return;

  const theme = getAccentTheme(themeKey);
  document.documentElement.setAttribute('data-accent', theme.key);

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', theme.themeColor);
  }
};
