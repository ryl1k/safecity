'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Profile } from '@safecity/shared';

interface ProfileCtx {
  /** The active need that drives which rating + layers are shown. */
  primary: Profile;
  setPrimary: (p: Profile) => void;
  ready: boolean;
}

const Ctx = createContext<ProfileCtx | null>(null);
const KEY = 'sc-primary-need';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [primary, setPrimaryState] = useState<Profile>('wheelchair');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Profile | null;
      if (stored === 'wheelchair' || stored === 'blind') setPrimaryState(stored);
    } catch {}
    setReady(true);
  }, []);

  const setPrimary = useCallback((p: Profile) => {
    setPrimaryState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ primary, setPrimary, ready }}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
