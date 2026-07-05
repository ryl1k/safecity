'use client';

import { useEffect } from 'react';

/**
 * Scopes vertical scroll-snap to the page that renders it: adds `sc-snap-page` to
 * <html> on mount and removes it on unmount, so the gentle proximity snap never
 * leaks into other routes. Renders nothing. Reduced-motion is handled in CSS
 * (the class becomes a no-op), so this stays a plain lifecycle toggle.
 */
export function ScrollSnap() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add('sc-snap-page');
    return () => el.classList.remove('sc-snap-page');
  }, []);
  return null;
}
