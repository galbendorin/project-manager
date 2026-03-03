import { useState, useEffect } from 'react';

/**
 * Reactive media-query hook.
 * Returns true when the query matches, re-evaluates on resize and orientation change.
 *
 * Usage:
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);

    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
    } else {
      // Safari 13 fallback
      mql.addListener(handler);
    }

    // Sync initial value
    setMatches(mql.matches);

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler);
      } else {
        mql.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
}
