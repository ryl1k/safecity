// Account-level B2B (mocked payments). Thin client over the Go API's /business
// surface. A user becomes a "business" (unlimited points + verified/priority
// perks) by subscribing — there is no on/off toggle.
import type { Category, PointFeatureMap } from '@safecity/shared';
import { api } from './api';
import { supabase } from './supabase';

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
// layout share one fetch. Scoped to the user it was fetched for — see below.
let meCache: Promise<BusinessMe> | null = null;
let meCacheUser: string | null = null;

/**
 * The caller's business status and the points they created. Cached for the
 * session; pass `fresh` after a mutation (subscribe, delete, verify request) to
 * bypass the cache.
 *
 * The cache is keyed by the current session's user id and re-validated on every
 * read. Sign-out uses `router.refresh()` and login uses `router.push()` — neither
 * reloads JS modules — so without this check a previous account's cached data
 * would leak into a freshly signed-in account (they'd see the wrong points and
 * subscription). Read-time validation is immune to auth-event ordering.
 */
export async function businessMe(fresh = false): Promise<BusinessMe> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id ?? null;
  if (fresh || !meCache || uid !== meCacheUser) {
    meCacheUser = uid;
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
  pointId: string;
  createdAt: string;
  stars: number;
}

/** One point's running view/search totals on a given day (one row per point per
 * day) — the dashboard sums across points or filters to one. */
export interface MetricDay {
  day: string; // YYYY-MM-DD
  pointId: string;
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

/** One visitor-submitted problem report on a point the caller owns. */
export interface BusinessReport {
  id: string;
  title: string;
  description: string | null;
  status: string; // reported | confirmed | escalated | resolved
  severity: number; // 1..3
  confirmations: number;
  photos: string[];
  pointId: string;
  pointName: string;
  createdAt: string;
}

/**
 * Problem reports visitors filed on the caller's own points — an inbox of issues
 * to fix (open first, then most severe). Reports on seeded points are handled by
 * moderators, not surfaced here.
 */
export async function businessReports(): Promise<BusinessReport[]> {
  return api.get<BusinessReport[]>('/business/reports', { auth: true });
}
