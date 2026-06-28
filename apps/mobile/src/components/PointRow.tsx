import { StyleSheet, Text, View } from 'react-native';
import type { AccessibilityFeature, PointSummary, Profile } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { radii, space, theme } from '@/theme/theme';
import { RatingBadge } from './RatingBadge';

interface Props {
  point: PointSummary;
  catalog: AccessibilityFeature[];
  profile: Profile;
}

/** One accessible-place row: name, category·distance, rating, present features. */
export function PointRow({ point, catalog, profile }: Props) {
  const rating = computeRating(point.features, catalog, point.category, profile);
  const summary = featureSummary(point, catalog, profile);
  const meta = [categoryLabel[point.category], distanceLabel(point.distanceM)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row} accessible accessibilityLabel={`${point.name}. ${meta}.`}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {point.name}
        </Text>
        <RatingBadge rating={rating} />
      </View>
      <Text style={styles.meta}>{meta}</Text>
      {summary ? (
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.lg,
    gap: space.xs,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text },
  meta: { fontSize: 13, color: theme.muted },
  summary: { fontSize: 14, color: theme.text },
});
