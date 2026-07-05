'use client';

import type { ReactNode } from 'react';
import { useBusiness } from '@/lib/businessContext';
import { BusinessPointSelect } from '@/components/BusinessPointSelect';

/**
 * Dashboard page header: the page title (and optional subtitle/actions) on the
 * SAME ROW as the shared point selector, right-aligned. Wraps on narrow screens.
 * Pass `hideSelector` on account-level pages (Overview, Subscription) where a
 * single-point selection is not meaningful.
 */
export function DashboardHeader({
  title, subtitle, actions, hideSelector,
}: { title: string; subtitle?: ReactNode; actions?: ReactNode; hideSelector?: boolean }) {
  const { me, selectedPointId, setSelectedPointId } = useBusiness();
  const showSel = !hideSelector && me.points.length > 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1em', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>{title}</h1>
        {subtitle && <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.92em' }}>{subtitle}</p>}
      </div>
      {(actions || showSel) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8em', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {actions}
          {showSel && <BusinessPointSelect points={me.points} value={selectedPointId} onChange={setSelectedPointId} />}
        </div>
      )}
    </div>
  );
}
