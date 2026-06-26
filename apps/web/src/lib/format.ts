import type { AccessibilityFeature, Category, PointSummary, Profile } from '@safecity/shared';

export const categoryLabel: Record<Category, string> = {
  venue: 'Заклад',
  transit: 'Транспорт',
  crossing: 'Перехід',
  toilet: 'Туалет',
  parking: 'Паркування',
};

export function distanceLabel(m?: number): string {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;
}

/** Clock-direction (1–12) from current location to a point, for the audio-first list. */
export function clockDirection(fromLng: number, fromLat: number, toLng: number, toLat: number): number {
  const dLng = (toLng - fromLng) * Math.cos((fromLat * Math.PI) / 180);
  const dLat = toLat - fromLat;
  let deg = (Math.atan2(dLng, dLat) * 180) / Math.PI; // 0 = north
  if (deg < 0) deg += 360;
  const hour = Math.round(deg / 30);
  return hour === 0 ? 12 : hour;
}

/** Short summary of present (yes) features for the active profile — e.g. "без сходів, туалет". */
export function featureSummary(
  point: PointSummary,
  catalog: AccessibilityFeature[],
  profile: Profile,
): string {
  const present = catalog
    .filter(
      (f) =>
        f.profile === profile &&
        f.categories.includes(point.category) &&
        point.features[f.key] === 'yes',
    )
    .map((f) => f.label.toLowerCase());
  return present.slice(0, 3).join(', ');
}
