// Accessibility feature catalog (small, cached). Read via Supabase — there's no
// Go API endpoint for it yet, so this stays Supabase-direct (works in RN).
import type { AccessibilityFeature } from '@safecity/shared';
import { supabase } from './supabase';

let cache: AccessibilityFeature[] | null = null;

export async function getCatalog(): Promise<AccessibilityFeature[]> {
  if (cache) return cache;
  const { data, error } = await supabase.from('accessibility_features').select('*');
  if (error) throw error;
  cache = (data ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    profile: r.profile,
    categories: r.categories,
    critical: r.critical,
    valueType: r.value_type,
    unit: r.unit,
  }));
  return cache;
}
