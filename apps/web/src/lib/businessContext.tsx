'use client';

import { createContext, useContext } from 'react';
import type { BusinessMe } from '@/lib/business';

export type BusinessGate = 'loading' | 'guest' | 'ok' | 'error';

export interface BusinessCtx {
  me: BusinessMe;
  reload: () => Promise<void>;
  // Point focused by the global top-right selector; shared across dashboard pages.
  selectedPointId: string | null;
  setSelectedPointId: (id: string) => void;
}

// Provided by app/business/layout.tsx once data is loaded, so every sub-page
// shares one businessMe fetch (the layout persists across sub-page navigation).
export const BusinessContext = createContext<BusinessCtx | null>(null);

export function useBusiness(): BusinessCtx {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within the /business layout');
  return ctx;
}
