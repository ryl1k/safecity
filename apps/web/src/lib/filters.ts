// Discovery-first filtering for the web map + places list.
// Wheelchair-first: accessibility + feature filters are computed for the
// wheelchair profile only. Feature chips are derived per-category from the
// catalog, so a toilet/crossing/parking shows its own relevant features.
import type { AccessibilityFeature, AccessLevel, Category, PointSummary, Rating } from '@safecity/shared';
import { accessLevel, computeRating } from '@safecity/shared';
import { categoryLabel } from './format';

const PROFILE = 'wheelchair' as const;

export const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

// Accessibility level → user-facing label + colour (the primary signal; no percentages).
export const levelLabel: Record<AccessLevel, string> = {
  high: 'Високий рівень',
  medium: 'Середній рівень',
  low: 'Низький рівень',
  unknown: 'Немає даних',
};
// CSS variables for in-app badges (theme-aware).
export const levelColor: Record<AccessLevel, string> = {
  high: 'var(--sc-ok)',
  medium: 'var(--sc-warn)',
  low: 'var(--sc-bad)',
  unknown: 'var(--sc-muted)',
};
// Fixed hex for MapLibre paint expressions (can't read CSS vars).
export const levelPinColor: Record<AccessLevel, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#dc2626',
  unknown: '#9ca3af',
};

/** The point's accessibility level for the active (wheelchair) profile. */
export function levelOf(p: PointSummary, catalog: AccessibilityFeature[]): AccessLevel {
  return accessLevel(p.features, catalog, p.category, PROFILE);
}

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

// Single source of truth with the level badge: "accessible" = High or Medium, so
// the map filter and the level shown on a pin can never disagree.
export function isAccessible(p: PointSummary, catalog: AccessibilityFeature[]): boolean {
  const l = levelOf(p, catalog);
  return l === 'high' || l === 'medium';
}

export interface FilterState {
  query: string;
  categories: Set<Category>;
  features: Set<string>; // catalog feature keys
  levels: Set<AccessLevel>; // empty = all levels
}

/** Feature chips require every chosen amenity; the level chips keep only the chosen
 *  inclusiveness levels. Both combine; empty sets = show everything. */
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
    if (keys.length && !keys.every((k) => p.features[k] === 'yes')) return false;
    if (st.levels.size > 0 && !st.levels.has(levelOf(p, catalog))) return false;
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
 * highest-scoring (most useful) one. Two properties make the visible set stable
 * while panning:
 *  1. Each cell's winner is chosen over ALL items (not just the in-view ones), so
 *     scrolling more of a cell into view never swaps which point represents it.
 *  2. Cells are world-anchored and the cell size is quantized to a power of two,
 *     so it depends only on zoom — panning (and float jitter) can't shift the grid.
 * Then we render only the winners that fall inside the viewport. Result: a pin
 * for a given place stays put on pan; pins only appear/disappear at the edges and
 * the grid only re-derives on zoom. Ties break on a stable id.
 */
export function declutter<T extends { id: string; lng: number; lat: number }>(
  items: T[],
  bbox: Bbox,
  gridN: number,
  score: (t: T) => number,
  pad = 0, // render this fraction of the viewport beyond each edge (off-screen buffer)
): T[] {
  const bw = bbox.maxLng - bbox.minLng;
  const bh = bbox.maxLat - bbox.minLat;
  const raw = bw / gridN;
  if (!(raw > 0)) return items;
  // Quantize to a power of two so the cell size is identical across pans at one zoom.
  const step = Math.pow(2, Math.round(Math.log2(raw)));
  const best = new Map<string, { item: T; s: number }>();
  for (const it of items) {
    const key = `${Math.floor(it.lng / step)}:${Math.floor(it.lat / step)}`;
    const s = score(it);
    const cur = best.get(key);
    if (!cur || s > cur.s || (s === cur.s && it.id < cur.item.id)) best.set(key, { item: it, s });
  }
  // Render winners within the viewport PLUS a margin, so panning reveals pins that
  // are already on the map instead of popping in at the edge.
  const minLng = bbox.minLng - bw * pad;
  const maxLng = bbox.maxLng + bw * pad;
  const minLat = bbox.minLat - bh * pad;
  const maxLat = bbox.maxLat + bh * pad;
  return Array.from(best.values(), (v) => v.item).filter(
    (it) => it.lng >= minLng && it.lng <= maxLng && it.lat >= minLat && it.lat <= maxLat,
  );
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
