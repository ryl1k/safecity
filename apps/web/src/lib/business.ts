// Account-level B2B (mocked payments). Thin client over the Go API's /business
// surface. A user becomes a "business" (unlimited points + verified/priority
// perks) by subscribing — there is no on/off toggle.
import type { Category, PointFeatureMap } from '@safecity/shared';
import { api } from './api';

export type SubscriptionPlan = 'monthly' | 'yearly';

export interface MyPoint {
  id: string;
  name: string;
  category: Category;
  address: string | null;
  verifyStatus: string;
  verificationRequestedAt: string | null;
  viewCount: number;
  searchAppearances: number;
  reviewCount: number;
  avgRating: number | null;
  features: PointFeatureMap;
  createdAt: string;
}

export interface BusinessMe {
  isBusiness: boolean;
  plan: SubscriptionPlan | null;
  renewsAt: string | null;
  points: MyPoint[];
}

// Session-level memo so AppHeader (which mounts on every page) and the dashboard
// layout share one fetch. Reset on sign-out, after mutations, or when a point is
// added elsewhere — see invalidateBusinessMe.
let meCache: Promise<BusinessMe> | null = null;

/**
 * The caller's business status and the points they created. Cached for the
 * session; pass `fresh` after a mutation (subscribe, delete, verify request) to
 * bypass the cache.
 */
export async function businessMe(fresh = false): Promise<BusinessMe> {
  if (fresh || !meCache) {
    meCache = api.get<BusinessMe>('/business/me', { auth: true }).catch((e) => {
      meCache = null; // don't cache a rejection
      throw e;
    });
  }
  return meCache;
}

/** Drop the cached businessMe (e.g. after adding a point or signing out). */
export function invalidateBusinessMe(): void {
  meCache = null;
}

/** MOCK — activates the account-level business subscription with no processor behind it. */
export async function subscribeBusiness(plan: SubscriptionPlan): Promise<void> {
  await api.post('/business/subscribe', { plan });
}

/** Ask a moderator to verify one of the caller's points. */
export async function requestPointVerification(pointId: string): Promise<void> {
  await api.post(`/business/points/${pointId}/request-verification`, {});
}

/** One review's timestamp + rating — for the reviews-over-time graph. */
export interface ReviewPoint {
  createdAt: string;
  stars: number;
}

/** One day's snapshot of the running view/search totals (summed across points). */
export interface MetricDay {
  day: string; // YYYY-MM-DD
  viewCount: number;
  searchAppearances: number;
}

export interface BusinessAnalyticsData {
  reviews: ReviewPoint[];
  metrics: MetricDay[];
}

/**
 * Time-series graphs for the caller's points. Reviews are real (timestamps);
 * metrics accrue forward from the first dashboard visit (no history predates the
 * snapshot feature). Fetching this also records today's totals server-side.
 */
export async function businessAnalytics(): Promise<BusinessAnalyticsData> {
  return api.get<BusinessAnalyticsData>('/business/analytics', { auth: true });
}
