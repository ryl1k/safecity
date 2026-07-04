// Account-level B2B (mocked payments). Thin client over the Go API's /business
// surface. A user becomes a "business" (unlimited points + verified/priority
// perks) by subscribing — there is no on/off toggle.
import { api } from './api';

export type SubscriptionPlan = 'monthly' | 'yearly';

export interface MyPoint {
  id: string;
  name: string;
  category: string;
  address: string | null;
  verifyStatus: string;
  viewCount: number;
  createdAt: string;
}

export interface BusinessMe {
  isBusiness: boolean;
  plan: SubscriptionPlan | null;
  renewsAt: string | null;
  points: MyPoint[];
}

/** The caller's business status and the points they created. */
export async function businessMe(): Promise<BusinessMe> {
  return api.get<BusinessMe>('/business/me', { auth: true });
}

/** MOCK — activates the account-level business subscription with no processor behind it. */
export async function subscribeBusiness(plan: SubscriptionPlan): Promise<void> {
  await api.post('/business/subscribe', { plan });
}
