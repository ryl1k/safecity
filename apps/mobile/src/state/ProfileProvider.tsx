import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@safecity/shared';

const PRIMARY_KEY = 'sc-primary-need';
const NEEDS_KEY = 'sc-needs';

function isProfile(v: unknown): v is Profile {
  return v === 'wheelchair' || v === 'blind';
}

interface ProfileCtx {
  /** Active need driving which rating + layers are shown. */
  primary: Profile;
  /** All needs picked at onboarding (empty = never onboarded). */
  needs: Profile[];
  hasOnboarded: boolean;
  setPrimary: (p: Profile) => void;
  setNeeds: (n: Profile[]) => void;
  completeOnboarding: (needs: Profile[], primary: Profile) => void;
  ready: boolean;
}

const Ctx = createContext<ProfileCtx | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimaryState] = useState<Profile>('wheelchair');
  const [needs, setNeedsState] = useState<Profile[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await AsyncStorage.getItem(PRIMARY_KEY);
        if (isProfile(p)) setPrimaryState(p);
        const raw = await AsyncStorage.getItem(NEEDS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setNeedsState(parsed.filter(isProfile));
        }
      } catch {
        // first run — defaults are fine
      }
      setReady(true);
    })();
  }, []);

  const setPrimary = useCallback((p: Profile) => {
    setPrimaryState(p);
    AsyncStorage.setItem(PRIMARY_KEY, p).catch(() => {});
  }, []);

  const setNeeds = useCallback((n: Profile[]) => {
    setNeedsState(n);
    AsyncStorage.setItem(NEEDS_KEY, JSON.stringify(n)).catch(() => {});
  }, []);

  const completeOnboarding = useCallback(
    (n: Profile[], p: Profile) => {
      setNeeds(n);
      setPrimary(p);
    },
    [setNeeds, setPrimary],
  );

  const value = useMemo<ProfileCtx>(
    () => ({
      primary,
      needs,
      hasOnboarded: needs.length > 0,
      setPrimary,
      setNeeds,
      completeOnboarding,
      ready,
    }),
    [primary, needs, ready, setPrimary, setNeeds, completeOnboarding],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
