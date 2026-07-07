'use client';

import { createContext, useContext } from 'react';

export type AdminGate = 'loading' | 'guest' | 'denied' | 'ok' | 'error';

/** Shared by the admin layout with its sub-pages: the moderator's own id (to mark
 * "you" in the user list) — the role gate itself lives in the layout. */
export interface AdminContextValue {
  meId: string;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within the admin layout');
  return ctx;
}
