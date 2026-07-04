// SafeCity domain types — single source of truth (KB 04/07/08). Platform-agnostic.

export type Profile = 'wheelchair' | 'blind';
export type Category = 'venue' | 'transit' | 'crossing' | 'toilet' | 'parking';
export type Rating = 'full' | 'partial' | 'none' | 'unknown';
export type FeatureValue = 'yes' | 'no' | 'unknown';
export type VerifyStatus = 'unverified' | 'verified' | 'official';
export type PointSource = 'imported' | 'crowdsourced' | 'official';
export type ProblemStatus = 'reported' | 'confirmed' | 'escalated' | 'resolved';

/** Catalog entry describing one accessibility feature (mirrors accessibility_features). */
export interface AccessibilityFeature {
  key: string;
  label: string;
  profile: Profile;
  categories: Category[];
  critical: boolean;
  valueType?: string;
  unit?: string | null;
}

/** Feature values for a point keyed by feature key (as returned by the geo RPCs' jsonb). */
export type PointFeatureMap = Record<string, FeatureValue>;

/** Shape returned by points_near / points_in_bbox RPCs (camelCased). */
export interface PointSummary {
  id: string;
  name: string;
  category: Category;
  address?: string | null;
  description?: string | null;
  photos?: string[];
  lng: number;
  lat: number;
  verifyStatus: VerifyStatus;
  distanceM?: number;
  features: PointFeatureMap;
  isBusiness?: boolean;
  verifiedPaid?: boolean;
  subscriptionActive?: boolean;
}

/** Per-profile ratings computed for a point. */
export type RatingByProfile = Record<Profile, Rating>;
