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

/** One accessibility criterion's contribution to the score. All figures are in
 * score points (out of 100). `value` is 'yes' (confirmed present), 'no' (a real
 * barrier — a physical change) or 'unknown' (not assessed — an easy confirm). */
export interface CriterionState {
  key: string;
  weight: number; // this criterion's share of the 100-point score
  value: FeatureValue;
  earned: number; // points currently earned: yes → weight, no → 0, unknown → weight/2
  gain: number; // points added by setting it to "yes" (0 when already yes)
  critical: boolean; // a "star" criterion (entrance / doors / ramp)
}

/** Actionable breakdown of a point's accessibility level: the current score, how
 * far it is from Medium/High, and the per-criterion composition. Returns null when
 * no weighted criteria apply to the category. */
export interface LevelBreakdown {
  level: AccessLevel;
  score: number; // 0..100 (rounded)
  toMedium: number; // score points needed to reach Medium (51); 0 if already there
  toHigh: number; // score points needed to reach High (75); 0 if already there
  criteria: CriterionState[]; // all applicable criteria, highest weight first
  gaps: CriterionState[]; // criteria not yet "yes", highest gain first
}

/**
 * Decompose the accessibility level — powers the B2B score gauge, the
 * "what's missing to reach High" plan, and the per-criterion breakdown. Uses the
 * SAME weights as accessLevel(), so guidance never contradicts the badge.
 * `unknown` gaps are easy wins (confirm/document, no construction); `no` gaps need
 * a real change. All figures are normalized to score points out of 100.
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

  let total = 0;
  for (const f of applicable) total += WHEELCHAIR_WEIGHTS[f.key] ?? 0;

  const criteria: CriterionState[] = applicable.map((f) => {
    const raw = WHEELCHAIR_WEIGHTS[f.key] ?? 0;
    const weight = (raw / total) * 100; // normalize → score points
    const v: FeatureValue = features[f.key] === 'yes' || features[f.key] === 'no' ? (features[f.key] as FeatureValue) : 'unknown';
    const earned = v === 'yes' ? weight : v === 'no' ? 0 : weight / 2;
    return { key: f.key, weight, value: v, earned, gain: weight - earned, critical: Boolean(f.critical) };
  });

  const score = criteria.reduce((s, c) => s + c.earned, 0);
  const byWeight = [...criteria].sort((a, b) => b.weight - a.weight);
  const gaps = criteria.filter((c) => c.value !== 'yes').sort((a, b) => b.gain - a.gain);

  return {
    level: accessLevel(features, catalog, category, profile),
    score: Math.round(score),
    toMedium: Math.max(0, Math.round(51 - score)),
    toHigh: Math.max(0, Math.round(75 - score)),
    criteria: byWeight,
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
