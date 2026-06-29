import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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

/** One accessible-place row → opens the point detail. */
export function PointRow({ point, catalog, profile }: Props) {
  const { palette, baseScale } = useTheme();
  const router = useRouter();
  const rating = computeRating(point.features, catalog, point.category, profile);
  const summary = featureSummary(point, catalog, profile);
  const meta = [categoryLabel[point.category], distanceLabel(point.distanceM)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${point.name}. ${meta}.`}
      onPress={() => router.push(`/point/${point.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
      ]}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.md, borderWidth: 1, padding: space.lg, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontWeight: '700' },
  meta: {},
  summary: {},
});
