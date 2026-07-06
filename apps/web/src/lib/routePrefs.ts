'use client';

// Wheelchair routing preferences. Persisted to localStorage and sent to the API's
// /route endpoint, which forwards them to OpenRouteService's wheelchair profile
// (min width / max incline / sloped-kerb limit) and, for `strict`, widens the set
// of segments the route steers around (marginal "partial" as well as impassable).

export interface RoutePrefs {
  minWidth: number; // metres; 0 = no requirement
  maxIncline: number; // percent grade; 0 = no limit
  avoidKerbs: boolean; // true → only flush kerbs (maxSlopedKerb 0)
  strict: boolean; // also avoid marginal ("partial") segments
}

// Defaults mirror the API's geo.DefaultRestrictions so an untouched panel is a no-op.
export const DEFAULT_ROUTE_PREFS: RoutePrefs = {
  minWidth: 0.8,
  maxIncline: 6,
  avoidKerbs: false,
  strict: false,
};

const KEY = 'sc-route-prefs';

export function loadRoutePrefs(): RoutePrefs {
  if (typeof window === 'undefined') return DEFAULT_ROUTE_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ROUTE_PREFS;
    return { ...DEFAULT_ROUTE_PREFS, ...(JSON.parse(raw) as Partial<RoutePrefs>) };
  } catch {
    return DEFAULT_ROUTE_PREFS;
  }
}

export function saveRoutePrefs(p: RoutePrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage disabled — prefs just won't persist */
  }
}

/** Shape the prefs into the /route request fields (`params` + `strict`). */
export function routePrefsPayload(p: RoutePrefs): {
  params: { minWidth: number; maxIncline: number; maxSlopedKerb: number };
  strict: boolean;
} {
  return {
    params: {
      minWidth: p.minWidth,
      maxIncline: p.maxIncline,
      maxSlopedKerb: p.avoidKerbs ? 0 : 0.03,
    },
    strict: p.strict,
  };
}

/** True when prefs differ from defaults — for showing an "active" indicator. */
export function routePrefsActive(p: RoutePrefs): boolean {
  return (
    p.minWidth !== DEFAULT_ROUTE_PREFS.minWidth ||
    p.maxIncline !== DEFAULT_ROUTE_PREFS.maxIncline ||
    p.avoidKerbs !== DEFAULT_ROUTE_PREFS.avoidKerbs ||
    p.strict !== DEFAULT_ROUTE_PREFS.strict
  );
}
