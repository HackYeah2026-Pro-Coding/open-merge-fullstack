import { useEffect, useState } from 'react';
import { getPhantom, type PhantomProvider } from './phantom';

/**
 * The Phantom provider, or null when the extension is not installed.
 * Extensions can inject after our script runs, so this re-checks on window load.
 */
export function usePhantom(): { provider: PhantomProvider | null; checked: boolean } {
  const [provider, setProvider] = useState<PhantomProvider | null>(() => getPhantom());
  const [checked, setChecked] = useState(() => document.readyState === 'complete' || getPhantom() !== null);

  useEffect(() => {
    if (checked) return;
    const onLoad = () => {
      setProvider(getPhantom());
      setChecked(true);
    };
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, [checked]);

  return { provider, checked };
}
