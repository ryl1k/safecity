// Discovery-first filtering for the web map + places list.
// Wheelchair-first: accessibility + feature filters are computed for the
// wheelchair profile only. Feature chips are derived per-category from the
// catalog, so a toilet/crossing/parking shows its own relevant features.
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { categoryLabel } from './format';

const PROFILE = 'wheelchair' as const;

export const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

// Category → distinct colour for map pins + chips/icons.
export const categoryColor: Record<Category, string> = {
  venue: '#0d5b66', // teal
  transit: '#2563eb', // blue
  crossing: '#d97706', // amber
  toilet: '#7c3aed', // purple
  parking: '#be185d', // magenta
};

export interface FeatureFilter {
  key: string; // catalog feature key (matched against point.features)
  label: string;
}

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  venue: ['заклад', 'кафе', 'ресторан', 'магазин', 'аптек', 'банк', 'готель', 'музей', 'пошт', 'cafe', 'shop'],
  transit: ['транспорт', 'зупин', 'автобус', 'трамвай', 'вокзал', 'bus', 'stop'],
  crossing: ['перехід', 'перехрест', 'crossing'],
  toilet: ['туалет', 'вбиральн', 'wc', 'toilet'],
  parking: ['паркув', 'парков', 'parking'],
};

/** Wheelchair feature filters relevant to the selected categories (critical first).
 *  "All categories" or "none selected" defaults to venue (the common case). */
export function featuresForCategories(catalog: AccessibilityFeature[], categories: Set<Category>): FeatureFilter[] {
  const allOrNone = categories.size === 0 || categories.size === CATEGORIES.length;
  const cats: Category[] = allOrNone ? ['venue'] : [...categories];
  const picked = catalog
    .filter((f) => f.profile === PROFILE && cats.some((c) => f.categories.includes(c)))
    .sort((a, b) => Number(b.critical) - Number(a.critical));
  const seen = new Set<string>();
  const out: FeatureFilter[] = [];
  for (const f of picked) {
    if (!seen.has(f.key)) {
      seen.add(f.key);
      out.push({ key: f.key, label: f.label });
    }
  }
  return out;
}

export function ratingOf(p: PointSummary, catalog: AccessibilityFeature[]): Rating {
  return computeRating(p.features, catalog, p.category, PROFILE);
}

export function isAccessible(p: PointSummary, catalog: AccessibilityFeature[]): boolean {
  const r = ratingOf(p, catalog);
  return r === 'full' || r === 'partial';
}

export interface FilterState {
  query: string;
  categories: Set<Category>;
  features: Set<string>; // catalog feature keys
  showInaccessible: boolean;
}

/** Feature keys act as the accessibility filter when present; otherwise the
 *  default hides non-accessible points unless "show inaccessible" is on. */
export function filterPoints(
  points: PointSummary[],
  catalog: AccessibilityFeature[],
  st: FilterState,
): PointSummary[] {
  const q = st.query.trim().toLowerCase();
  const keys = [...st.features];
  return points.filter((p) => {
    if (st.categories.size && !st.categories.has(p.category)) return false;
    if (q && !`${p.name} ${p.address ?? ''}`.toLowerCase().includes(q)) return false;
    if (keys.length) return keys.every((k) => p.features[k] === 'yes');
    if (!st.showInaccessible) return isAccessible(p, catalog);
    return true;
  });
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Map declutter (Google-Maps style): keep at most one item per grid cell — the
 * highest-scoring (most useful) one. The grid is anchored to WORLD coordinates
 * (not the moving viewport), so panning never shifts cell boundaries: the same
 * winners stay put, only edge points enter/leave. The cell size derives from the
 * viewport width, so the grid changes only on zoom. `gridN` controls density.
 * Ties break on a stable id so re-renders don't swap the visible marker.
 */
export function declutter<T extends { id: string; lng: number; lat: number }>(
  items: T[],
  bbox: Bbox,
  gridN: number,
  score: (t: T) => number,
): T[] {
  const w = (bbox.maxLng - bbox.minLng) / gridN;
  const h = (bbox.maxLat - bbox.minLat) / gridN;
  if (!(w > 0) || !(h > 0)) return items;
  const best = new Map<string, { item: T; s: number }>();
  for (const it of items) {
    if (it.lng < bbox.minLng || it.lng > bbox.maxLng || it.lat < bbox.minLat || it.lat > bbox.maxLat) continue;
    // World-anchored cell (independent of pan).
    const key = `${Math.floor(it.lng / w)}:${Math.floor(it.lat / h)}`;
    const s = score(it);
    const cur = best.get(key);
    if (!cur || s > cur.s || (s === cur.s && it.id < cur.item.id)) best.set(key, { item: it, s });
  }
  return Array.from(best.values(), (v) => v.item);
}

/** Smart search: categories (by keyword) + wheelchair features (by label) matching the query. */
export function suggestFilters(
  query: string,
  catalog: AccessibilityFeature[],
): { categories: Category[]; features: FeatureFilter[] } {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { categories: [], features: [] };
  const categories = CATEGORIES.filter(
    (c) => categoryLabel[c].toLowerCase().includes(q) || CATEGORY_KEYWORDS[c].some((k) => k.includes(q) || q.includes(k)),
  );
  const seen = new Set<string>();
  const features: FeatureFilter[] = [];
  for (const f of catalog) {
    if (f.profile !== PROFILE || seen.has(f.key)) continue;
    if (f.label.toLowerCase().includes(q)) {
      seen.add(f.key);
      features.push({ key: f.key, label: f.label });
    }
  }
  return { categories, features };
}
