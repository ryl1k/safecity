'use client';

import { useEffect, useState } from 'react';
import type { ToastKind } from '@/lib/toast';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const COLORS: Record<ToastKind, { bg: string; fg: string }> = {
  error: { bg: '#7f1d1d', fg: '#fff' },
  success: { bg: '#14532d', fg: '#fff' },
  info: { bg: '#1f2937', fg: '#fff' },
};

// Global toast host. Listens for `sc-toast` window events (see lib/toast.ts) and
// renders transient, auto-dismissing messages. Mounted once in the root layout.
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; kind?: ToastKind }>).detail;
      if (!detail?.message) return;
      const id = ++seq;
      setToasts((t) => [...t, { id, message: detail.message, kind: detail.kind ?? 'info' }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener('sc-toast', onToast);
    return () => window.removeEventListener('sc-toast', onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', bottom: '1.5em', left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5em', width: 'min(92vw, 440px)',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          style={{
            background: COLORS[t.kind].bg, color: COLORS[t.kind].fg,
            padding: '0.85em 1.1em', borderRadius: '0.7em', fontSize: '0.92em', fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)', textAlign: 'center', lineHeight: 1.35,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
