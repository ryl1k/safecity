import { StyleSheet, Text, View } from 'react-native';
import type { AccessibilityFeature, PointSummary, Profile } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { radii, space, useTheme } from '@/theme/theme';
import { RatingBadge } from './RatingBadge';

interface Props {
  point: PointSummary;
  catalog: AccessibilityFeature[];
  profile: Profile;
}

/** One accessible-place row: name, category·distance, rating, present features. */
export function PointRow({ point, catalog, profile }: Props) {
  const { palette, baseScale } = useTheme();
  const rating = computeRating(point.features, catalog, point.category, profile);
  const summary = featureSummary(point, catalog, profile);
  const meta = [categoryLabel[point.category], distanceLabel(point.distanceM)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      accessible
      accessibilityLabel={`${point.name}. ${meta}.`}
      style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.head}>
        <Text style={[styles.name, { color: palette.text, fontSize: 16 * baseScale }]} numberOfLines={1}>
          {point.name}
        </Text>
        <RatingBadge rating={rating} />
      </View>
      <Text style={[styles.meta, { color: palette.muted, fontSize: 13 * baseScale }]}>{meta}</Text>
      {summary ? (
        <Text style={[styles.summary, { color: palette.text, fontSize: 14 * baseScale }]} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.md, borderWidth: 1, padding: space.lg, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontWeight: '700' },
  meta: {},
  summary: {},
});
