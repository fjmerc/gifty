import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import axiosInstance from './axiosInstance';
import { useAuth } from './AuthContext';
import {
  THEME_PREFERENCES, applyTheme, normalizePreference, readStoredPreference,
  resolveTheme, storePreference, systemDarkQuery,
} from './utils/theme';

const ThemeContext = createContext(null);

/**
 * Applies the Theme setting to <html data-theme>. The choice is remembered on
 * this device (so signed-out pages and the next visit start right) and, once
 * signed in, taken from the account's saved preference.
 */
export const ThemeProvider = ({ children }) => {
  const isAuthenticated = Boolean(useAuth()?.isAuthenticated);
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(() => Boolean(systemDarkQuery()?.matches));
  // Set once the person picks a theme, so a slower server answer cannot undo it
  const chosenRef = useRef(false);

  // System follows the operating system, including changes while open
  useEffect(() => {
    if (preference !== 'system') return undefined;
    const query = systemDarkQuery();
    if (!query) return undefined;
    setSystemIsDark(Boolean(query.matches));
    const onChange = (event) => setSystemIsDark(Boolean(event.matches));
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    }
    return undefined;
  }, [preference]);

  const theme = resolveTheme(preference, systemIsDark);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const remember = useCallback((value) => {
    const next = normalizePreference(value);
    storePreference(next);
    setPreferenceState(next);
  }, []);

  const setPreference = useCallback((value) => {
    chosenRef.current = true;
    remember(value);
  }, [remember]);

  // Signed in: the account's saved preference is the source of truth
  useEffect(() => {
    if (!isAuthenticated) {
      // A new sign-in starts from that account's saved preference
      chosenRef.current = false;
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await axiosInstance.get('/settings/user-preferences');
        const saved = response?.data?.theme;
        if (!cancelled && !chosenRef.current && THEME_PREFERENCES.includes(saved)) {
          remember(saved);
        }
      } catch (error) {
        // Keep the remembered or system theme
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, remember]);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/** { preference, theme, setPreference }, or null outside a ThemeProvider. */
export const useTheme = () => useContext(ThemeContext);
