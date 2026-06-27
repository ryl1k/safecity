import type { Profile } from '@safecity/shared';
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
 * Safe to call after every login — it just upserts the stored needs/primary.
 */
export async function syncProfileToAccount(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { needs, primary } = readLocalProfile();
  if (!needs.length && !primary) return;
  await supabase
    .from('profiles')
    .update({ needs, primary_need: primary ?? needs[0] ?? null })
    .eq('id', data.user.id);
}
