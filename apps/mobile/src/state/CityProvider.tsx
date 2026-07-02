// Selected-city context (nationwide map support). Mirrors ProfileProvider's
// AsyncStorage hydrate/persist pattern. Defaults to DEFAULT_CITY_ID (Lviv)
// while loading so the map can render immediately.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cityById, DEFAULT_CITY_ID, loadCity, saveCity, type City } from '@/lib/cities';

interface CityCtx {
  city: City;
  setCity: (id: string) => void;
  ready: boolean;
}

const Ctx = createContext<CityCtx | null>(null);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<City>(() => cityById(DEFAULT_CITY_ID));
  const [ready, setReady] = useState(false);
  // Set when the user picks a city; hydration must not clobber that pick if
  // the AsyncStorage load resolves after the selection.
  const userPicked = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await loadCity();
        if (!userPicked.current) setCityState(c);
      } catch {
        // first run — default is fine
      }
      setReady(true);
    })();
  }, []);

  const setCity = useCallback((id: string) => {
    userPicked.current = true;
    const c = cityById(id);
    setCityState(c);
    saveCity(c.id).catch(() => {});
  }, []);

  const value = useMemo<CityCtx>(() => ({ city, setCity, ready }), [city, setCity, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCity(): CityCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCity must be used within CityProvider');
  return ctx;
}
