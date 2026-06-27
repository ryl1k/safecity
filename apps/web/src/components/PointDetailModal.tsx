'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PointDetailContent } from './PointDetailContent';

/** Map-context modal for a point — keeps the user on the map. Centered, scrolls if tall. */
export function PointDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Деталі місця"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '4vh 1em', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sc-animate-in"
        style={{
          width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--sc-bg)', borderRadius: '1.1em', boxShadow: 'var(--sc-shadow-2)', position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="sc-foc"
          style={{
            position: 'sticky', top: '0.7em', float: 'right', marginRight: '0.7em', zIndex: 1,
            width: '2.2em', height: '2.2em', borderRadius: '50%', cursor: 'pointer',
            border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)',
            color: 'var(--sc-text)', display: 'grid', placeItems: 'center',
          }}
        >
          <X size={18} aria-hidden />
        </button>
        <div style={{ padding: '1.6em 1.4em 2em' }}>
          <PointDetailContent id={id} />
        </div>
      </div>
    </div>
  );
}
