import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'openmerge.theme';

function read(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The theme lives on <html data-theme>; index.html applies the saved choice before first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as const);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // The choice still applies for this visit; it just will not be remembered.
      console.warn('Could not save theme preference', error);
    }
  }, []);

  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
