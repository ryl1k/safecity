import type { Profile } from '@safecity/shared';
import { api } from './api';
import { supabase } from './supabase';

const PRIMARY_KEY = 'sc-primary-need';
const NEEDS_KEY = 'sc-needs';

function readLocalProfile(): { needs: Profile[]; primary: Profile | null } {
  let primary: Profile | null = null;
  let needs: Profile[] = [];
  try {
    const p = localStorage.getItem(PRIMARY_KEY);
    if (p === 'wheelchair' || p === 'blind') primary = p;
    const raw = localStorage.getItem(NEEDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) needs = parsed.filter((n): n is Profile => n === 'wheelchair' || n === 'blind');
    }
  } catch {
    /* ignore */
  }
  if (!needs.length && primary) needs = [primary];
  return { needs, primary };
}

/**
 * Merge the guest's device accessibility profile into their account on sign-in.
 * Safe to call after every login — the API upserts the stored needs/primary.
 */
export async function syncProfileToAccount(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { needs, primary } = readLocalProfile();
  if (!needs.length && !primary) return;
  try {
    await api.post('/me/profile', { needs, primary: primary ?? needs[0] ?? '' });
  } catch {
    /* best-effort sync — never block the login flow */
  }
}
