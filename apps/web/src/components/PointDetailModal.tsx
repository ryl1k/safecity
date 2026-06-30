'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PointDetailContent } from './PointDetailContent';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Left side-panel for point details — map stays visible and interactive behind it. */
export function PointDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Деталі місця"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: 'min(420px, 100vw)',
        zIndex: 60,
        background: 'var(--sc-bg)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        borderRight: 'var(--sc-bw) solid var(--sc-border)',
      }}
    >
      {/* Sticky header with close button */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '0.6em 0.7em 0',
        background: 'var(--sc-bg)',
      }}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="sc-foc"
          style={{
            width: '2.2em', height: '2.2em', borderRadius: '50%', cursor: 'pointer',
            border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)',
            color: 'var(--sc-text)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div style={{ padding: '0.4em 1.4em 2.5em' }}>
        <PointDetailContent id={id} />
      </div>
    </div>
  );
}
