// Business listings — self-serve B2B points (mocked payments). Thin client over
// the Go API's /business surface.
import type { Category } from '@safecity/shared';
import { api } from './api';

export interface NewBusinessPoint {
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address?: string;
  description?: string;
  features?: Record<string, 'yes' | 'no' | 'unknown'>;
  photos?: string[];
}

export async function createBusinessPoint(in_: NewBusinessPoint): Promise<string> {
  const res = await api.post<{ id: string }>('/business/points', in_);
  return res.id;
}

export type SubscriptionStatus = 'none' | 'active' | 'expired';
export type SubscriptionPlan = 'monthly' | 'yearly';

export interface BusinessPoint {
  pointId: string;
  name: string;
  category: Category;
  address: string | null;
  verifyStatus: string;
  verifiedPaid: boolean;
  verifiedPaidAt: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionRenewsAt: string | null;
  createdAt: string;
}

export async function myBusinessPoints(): Promise<BusinessPoint[]> {
  return api.get<BusinessPoint[]>('/business/points/me', { auth: true });
}

/** MOCK — flips verified_paid with no payment processor behind it. */
export async function payVerification(pointId: string): Promise<void> {
  await api.post(`/business/points/${pointId}/verify-payment`);
}

/** MOCK — flips subscription_status to active with no payment processor behind it. */
export async function subscribe(pointId: string, plan: SubscriptionPlan): Promise<void> {
  await api.post(`/business/points/${pointId}/subscribe`, { plan });
}
