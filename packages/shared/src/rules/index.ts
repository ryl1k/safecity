// Accessibility rules engine — THE single source of truth for the traffic-light (KB 04).
// Pure functions: given a point's feature values + the feature catalog, derive the
// per-profile rating. Used identically by web, mobile, and api.

import type {
  AccessibilityFeature,
  Category,
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
