// Discovery-first filtering for the map + places list (mobility/immobility focus).
// Shared so the map and list behave identically.
import type { AccessibilityFeature, Category, PointSummary, Profile, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { categoryLabel } from './format';

export const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

// Category → MaterialCommunityIcons glyph (map pins + filter chips).
export const categoryIcon: Record<Category, string> = {
  venue: 'storefront',
  transit: 'bus',
  crossing: 'walk',
  toilet: 'toilet',
  parking: 'parking',
};

export interface FeatureFilter {
  id: string;
  label: string;
  icon: string;
  keys: string[]; // matched against point.features (any === 'yes')
  keywords: string[]; // for smart-search suggestions
}

// Mobility (wheelchair) feature filters — the immobility-first filter set.
export const MOBILITY_FILTERS: FeatureFilter[] = [
  { id: 'step_free', label: 'Без сходів', icon: 'door-open', keys: ['step_free_entrance'], keywords: ['без сход', 'сход', 'рівень', 'вхід', 'step'] },
  { id: 'ramp', label: 'Пандус', icon: 'slope-uphill', keys: ['ramp'], keywords: ['пандус', 'ramp'] },
  { id: 'elevator', label: 'Ліфт', icon: 'elevator-passenger', keys: ['elevator'], keywords: ['ліфт', 'підйомник', 'elevator', 'lift'] },
  { id: 'toilet', label: 'Доступний туалет', icon: 'toilet', keys: ['accessible_toilet', 'accessible_stall'], keywords: ['туалет', 'вбиральн', 'toilet', 'wc'] },
  { id: 'parking', label: 'Паркування', icon: 'parking', keys: ['accessible_parking_near', 'disabled_bay'], keywords: ['паркув', 'парков', 'parking'] },
];

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  venue: ['заклад', 'кафе', 'ресторан', 'магазин', 'аптек', 'банк', 'готель', 'музей', 'пошт', 'cafe', 'shop'],
  transit: ['транспорт', 'зупин', 'автобус', 'трамвай', 'вокзал', 'bus', 'stop'],
  crossing: ['перехід', 'перехрест', 'crossing'],
  toilet: ['туалет', 'вбиральн', 'wc', 'toilet'],
  parking: ['паркув', 'парков', 'parking'],
};

export function ratingOf(p: PointSummary, catalog: AccessibilityFeature[], profile: Profile): Rating {
  return computeRating(p.features, catalog, p.category, profile);
}

export function isAccessible(p: PointSummary, catalog: AccessibilityFeature[], profile: Profile): boolean {
  const r = ratingOf(p, catalog, profile);
  return r === 'full' || r === 'partial';
}

function hasFeature(p: PointSummary, f: FeatureFilter): boolean {
  return f.keys.some((k) => p.features[k] === 'yes');
}

export interface FilterState {
  query: string;
  categories: Set<Category>;
  features: Set<string>; // FeatureFilter ids
  showInaccessible: boolean;
}

/** Apply the unified filter model. Feature chips act as the accessibility filter
 *  when present; otherwise the default hides non-accessible points unless the
 *  "show inaccessible" toggle is on. */
export function filterPoints(
  points: PointSummary[],
  catalog: AccessibilityFeature[],
  profile: Profile,
  st: FilterState,
): PointSummary[] {
  const q = st.query.trim().toLowerCase();
  const feats = MOBILITY_FILTERS.filter((f) => st.features.has(f.id));
  return points.filter((p) => {
    if (st.categories.size && !st.categories.has(p.category)) return false;
    if (q && !`${p.name} ${p.address ?? ''}`.toLowerCase().includes(q)) return false;
    if (feats.length) return feats.every((f) => hasFeature(p, f));
    if (!st.showInaccessible) return isAccessible(p, catalog, profile);
    return true;
  });
}

/** Smart search: categories/features whose label or keywords match the query. */
export function suggestFilters(query: string): { categories: Category[]; features: FeatureFilter[] } {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { categories: [], features: [] };
  const match = (cands: string[]) => cands.some((k) => k.includes(q) || q.includes(k));
  const categories = CATEGORIES.filter(
    (c) => categoryLabel[c].toLowerCase().includes(q) || match(CATEGORY_KEYWORDS[c]),
  );
  const features = MOBILITY_FILTERS.filter((f) => f.label.toLowerCase().includes(q) || match(f.keywords));
  return { categories, features };
}
