import type { AccessibilityFeature } from '@safecity/shared';
import { api } from './api';

let cache: AccessibilityFeature[] | null = null;

/** Load the accessibility feature catalog (small, cached for the session). */
export async function getCatalog(): Promise<AccessibilityFeature[]> {
  if (cache) return cache;
  const rows = await api.get<
    {
      key: string;
      label: string;
      profile: AccessibilityFeature['profile'];
      categories: AccessibilityFeature['categories'];
      critical: boolean;
      value_type: AccessibilityFeature['valueType'];
      unit: string | null;
    }[]
  >('/catalog/features');
  cache = rows.map((r) => ({
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
