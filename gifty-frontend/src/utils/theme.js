// Theme preference helpers. The preference is 'light', 'dark' or 'system';
// the applied theme (<html data-theme>) is always 'light' or 'dark'.
// public/index.html carries a copy of resolve + apply as an inline script so
// the remembered theme is on the page before React loads; keep the storage
// key in step with it (src/__tests__/themeInit.test.js checks).

export const THEME_STORAGE_KEY = 'gifty-theme';
export const THEME_PREFERENCES = ['light', 'dark', 'system'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const normalizePreference = (value) =>
  (THEME_PREFERENCES.includes(value) ? value : 'system');

export const readStoredPreference = () => {
  try {
    return normalizePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch (error) {
    return 'system';
  }
};

export const storePreference = (preference) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    // Private windows and blocked storage: the theme still applies, it is
    // just not remembered on this device.
  }
};

/** The operating system's dark-mode query, or null where unavailable. */
export const systemDarkQuery = () => {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) || null : null;
  } catch (error) {
    return null;
  }
};

export const resolveTheme = (preference, systemIsDark) => {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemIsDark ? 'dark' : 'light';
};

export const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};
