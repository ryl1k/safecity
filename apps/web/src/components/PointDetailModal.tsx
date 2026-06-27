'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PointDetailContent } from './PointDetailContent';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/** Map-context modal for a point — keeps the user on the map. Centered, scrolls if tall. */
export function PointDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    // Move focus into the dialog so screen-reader / keyboard users land on it.
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Trap focus within the dialog.
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.(); // restore focus to whatever opened the modal
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', zIndex: 60, background: 'rgba(0,0,0,.45)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '1em', overflow: 'hidden',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Деталі місця"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'calc(100dvh - 2em)', overflowY: 'auto',
          background: 'var(--sc-bg)', borderRadius: '1.1em', boxShadow: 'var(--sc-shadow-2)', position: 'relative',
        }}
      >
        <button
          ref={closeRef}
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
