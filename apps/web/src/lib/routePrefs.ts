'use client';

export interface RoutePrefs {
  maxIncline: number; // percent grade; 0 = no limit
}

export const DEFAULT_ROUTE_PREFS: RoutePrefs = {
  maxIncline: 6,
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

/** Shape the prefs into the /route request `params` field. */
export function routePrefsPayload(p: RoutePrefs): { params: { maxIncline: number } } {
  return { params: { maxIncline: p.maxIncline } };
}

/** True when prefs differ from defaults — for showing an "active" indicator. */
export function routePrefsActive(p: RoutePrefs): boolean {
  return p.maxIncline !== DEFAULT_ROUTE_PREFS.maxIncline;
}
