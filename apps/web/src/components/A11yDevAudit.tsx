'use client';

import { useEffect } from 'react';

/**
 * Dev-only accessibility audit. Loads axe-core from a CDN in development and logs
 * violations (incl. colour-contrast) to the console. No-op in production and adds
 * zero bundle weight. CI a11y gating lives in the CI/CD pipeline.
 */
export function A11yDevAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const existing = (window as any).axe;
    const run = () => {
      const axe = (window as any).axe;
      if (!axe) return;
      axe
        .run(document, { resultTypes: ['violations'] })
        .then((res: { violations: { id: string; help: string; impact?: string; nodes: unknown[] }[] }) => {
          if (!res.violations.length) {
            console.info('%c[axe] no accessibility violations', 'color:#16794d');
            return;
          }
          console.groupCollapsed(`%c[axe] ${res.violations.length} accessibility issue(s)`, 'color:#b3261e');
          res.violations.forEach((v) => console.warn(`${v.impact ?? 'n/a'} · ${v.id}: ${v.help} (${v.nodes.length})`));
          console.groupEnd();
        })
        .catch(() => {});
    };

    if (existing) {
      run();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js';
    s.async = true;
    s.onload = () => setTimeout(run, 800);
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return null;
}
