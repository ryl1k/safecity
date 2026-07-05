// Accessibility rules engine — THE single source of truth for the traffic-light (KB 04).
// Pure functions: given a point's feature values + the feature catalog, derive the
// per-profile rating. Used identically by web, mobile, and api.

import type {
  AccessibilityFeature,
  AccessLevel,
  Category,
  FeatureValue,
  PointFeatureMap,
  Profile,
  Rating,
  RatingByProfile,
} from '../types';

/** Critical features that apply to a given (category, profile). */
export function criticalFeatures(
  catalog: AccessibilityFeature[],
  category: Category,
  profile: Profile,
): AccessibilityFeature[] {
  return catalog.filter(
    (f) => f.profile === profile && f.critical && f.categories.includes(category),
  );
}

/**
 * Derive the traffic-light rating for one profile.
 * - 🟢 full    — every critical feature present
 * - 🟡 partial — at least one critical present, but not all
 * - 🔴 none    — zero critical present, with at least one known barrier
 * - ⚪ unknown — no critical criteria defined, or no critical features known yet
 */
export function computeRating(
  features: PointFeatureMap,
  catalog: AccessibilityFeature[],
  category: Category,
  profile: Profile,
): Rating {
  const critical = criticalFeatures(catalog, category, profile);
  if (critical.length === 0) return 'unknown';

  let yes = 0;
  let known = 0;
  for (const f of critical) {
    const v = features[f.key] ?? 'unknown';
    if (v === 'yes') {
      yes += 1;
      known += 1;
    } else if (v === 'no') {
      known += 1;
    }
  }

  if (known === 0) return 'unknown';
  if (yes === critical.length) return 'full';
  if (yes > 0) return 'partial';
  return 'none';
}

// Per-criterion weights for the wheelchair accessibility score (each set sums to
// 100 within its category). Так → full weight, Ні → 0, Невідомо → 0.5 × weight
// (uncertainty costs, but not everything).
const WHEELCHAIR_WEIGHTS: Record<string, number> = {
  // venue — entry blockers weighted highest
  step_free_entrance: 25, // blocker #1
  door_width: 20, // blocker #2 — no getting through
  ramp: 15, // alternative/complement to a step-free entrance
  accessible_toilet: 12, // matters for a longer visit
  ramp_slope_ok: 10, // a steep ramp formally exists but is unusable
  level_interior: 8, // mobility inside
  elevator: 6, // conditional (multi-storey only)
  accessible_parking_near: 4, // convenience, not a blocker
  // transit
  step_free_to_stop: 40,
  level_boarding: 40,
  low_floor_vehicles: 20,
};

/**
 * User-facing accessibility LEVEL (high/medium/low) — the primary signal shown on
 * the map, in search, and on the point page (no percentages). Weighted 0..100 score:
 *   Так → full weight · Ні → 0 · Невідомо/absent → 0.5 × weight
 * Bands: ≥75 High · 51–74 Medium · ≤50 Low. Plus a floor: ≥2 "star" (critical)
 * criteria present → at least Medium, whatever the raw score.
 */
export function accessLevel(
  features: PointFeatureMap,
  catalog: AccessibilityFeature[],
  category: Category,
  profile: Profile = 'wheelchair',
): AccessLevel {
  const applicable = catalog.filter(
    (f) => f.profile === profile && f.categories.includes(category) && WHEELCHAIR_WEIGHTS[f.key] != null,
  );
  if (applicable.length === 0) return 'unknown';

  let earned = 0;
  let total = 0;
  let starsYes = 0;
  for (const f of applicable) {
    const w = WHEELCHAIR_WEIGHTS[f.key] ?? 0; // always defined — applicable is filtered on it
    total += w;
    const v = features[f.key];
    if (v === 'yes') earned += w;
    else if (v !== 'no') earned += 0.5 * w; // unknown / not assessed
    if (f.critical && v === 'yes') starsYes += 1;
  }
  const score = (earned / total) * 100;

  if (score >= 75) return 'high';
  if (score >= 51 || starsYes >= 2) return 'medium';
  return 'low';
}

/** One accessibility criterion that is not yet confirmed present, with the score
 * gain from setting it to "yes". `value` is 'no' (a real barrier — a physical
 * change) or 'unknown' (not yet assessed — an easy confirm). */
export interface CriterionGap {
  key: string;
  weight: number; // raw weight (score points, since each category's set sums to 100)
  value: FeatureValue; // 'no' | 'unknown' (never 'yes' — those aren't gaps)
  gain: number; // score points (0..100) added by setting this criterion to "yes"
}

/** Actionable breakdown of a point's accessibility level: the current score, how
 * far it is from Medium/High, and which criteria to improve (highest-impact first).
 * Returns null when no weighted criteria apply to the category. */
export interface LevelBreakdown {
  level: AccessLevel;
  score: number; // 0..100 (rounded)
  toMedium: number; // score points needed to reach Medium (51); 0 if already there
  toHigh: number; // score points needed to reach High (75); 0 if already there
  gaps: CriterionGap[]; // criteria not yet "yes", highest gain first
}

/**
 * Decompose the accessibility level into an actionable plan — powers the B2B
 * "what's missing to reach High, and what's easiest" view. Uses the SAME weights
 * as accessLevel(), so guidance never contradicts the badge. `unknown` gaps are
 * the easy wins (confirm/document, no construction); `no` gaps need a real change.
 */
export function accessLevelBreakdown(
  features: PointFeatureMap,
  catalog: AccessibilityFeature[],
  category: Category,
  profile: Profile = 'wheelchair',
): LevelBreakdown | null {
  const applicable = catalog.filter(
    (f) => f.profile === profile && f.categories.includes(category) && WHEELCHAIR_WEIGHTS[f.key] != null,
  );
  if (applicable.length === 0) return null;

  let earned = 0;
  let total = 0;
  const gaps: CriterionGap[] = [];
  for (const f of applicable) {
    const w = WHEELCHAIR_WEIGHTS[f.key] ?? 0;
    total += w;
    const raw = features[f.key];
    const v: FeatureValue = raw === 'yes' || raw === 'no' ? raw : 'unknown';
    const contrib = v === 'yes' ? w : v === 'no' ? 0 : 0.5 * w;
    earned += contrib;
    if (v !== 'yes') gaps.push({ key: f.key, weight: w, value: v, gain: w - contrib });
  }
  const score = (earned / total) * 100;
  // Normalize weight units → score points (total is 100 for full catalogs, less
  // if some criteria are absent from this category).
  for (const g of gaps) g.gain = (g.gain / total) * 100;
  gaps.sort((a, b) => b.gain - a.gain);

  return {
    level: accessLevel(features, catalog, category, profile),
    score: Math.round(score),
    toMedium: Math.max(0, Math.round(51 - score)),
    toHigh: Math.max(0, Math.round(75 - score)),
    gaps,
  };
}

/** Compute ratings for all profiles at once (what the map/list renders). */
export function computeRatings(
  features: PointFeatureMap,
  catalog: AccessibilityFeature[],
  category: Category,
  profiles: Profile[] = ['wheelchair', 'blind'],
): RatingByProfile {
  const out = {} as RatingByProfile;
  for (const p of profiles) out[p] = computeRating(features, catalog, category, p);
  return out;
}
