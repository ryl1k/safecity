'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Profile } from '@safecity/shared';

interface ProfileCtx {
  /** The active need that drives which rating + layers are shown. */
  primary: Profile;
  setPrimary: (p: Profile) => void;
  /** All needs the user selected at onboarding (empty if they never onboarded). */
  needs: Profile[];
  setNeeds: (n: Profile[]) => void;
  ready: boolean;
}

const Ctx = createContext<ProfileCtx | null>(null);
const KEY = 'sc-primary-need';
const NEEDS_KEY = 'sc-needs';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [primary, setPrimaryState] = useState<Profile>('wheelchair');
  const [needs, setNeedsState] = useState<Profile[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Profile | null;
      if (stored === 'wheelchair' || stored === 'blind') setPrimaryState(stored);
      const rawNeeds = localStorage.getItem(NEEDS_KEY);
      if (rawNeeds) {
        const parsed = JSON.parse(rawNeeds);
        if (Array.isArray(parsed)) setNeedsState(parsed.filter((n): n is Profile => n === 'wheelchair' || n === 'blind'));
      }
    } catch {}
    setReady(true);
  }, []);

  const setPrimary = useCallback((p: Profile) => {
    setPrimaryState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {}
  }, []);

  const setNeeds = useCallback((n: Profile[]) => {
    setNeedsState(n);
    try {
      localStorage.setItem(NEEDS_KEY, JSON.stringify(n));
    } catch {}
  }, []);

  return <Ctx.Provider value={{ primary, setPrimary, needs, setNeeds, ready }}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
