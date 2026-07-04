'use client';

export type ToastKind = 'error' | 'success' | 'info';

// Fire-and-forget toast. Rendered by <Toaster/> (mounted in the root layout).
export function toast(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('sc-toast', { detail: { message, kind } }));
}
