import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

function readForceMobile(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mobile') === '1' || q.get('mobile') === 'true') return true;
    if (localStorage.getItem('devdash_force_mobile') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function useIsMobile(): boolean {
  const media = useMediaQuery('(max-width: 768px)');
  const [forced, setForced] = useState(false);
  useEffect(() => {
    setForced(readForceMobile());
  }, []);
  return forced || media;
}
