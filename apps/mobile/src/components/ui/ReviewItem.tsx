import { StyleSheet, Text, View } from 'react-native';
import type { Profile } from '@safecity/shared';
import { radii, space, useTheme } from '@/theme/theme';
import type { ReviewRow } from '@/lib/reviews';

const PROFILE_TAG: Record<Profile, string> = { wheelchair: 'візок', blind: 'зір' };

export function ReviewItem({ review }: { review: ReviewRow }) {
  const { palette, baseScale } = useTheme();
  const stars = '★'.repeat(review.stars) + '☆'.repeat(Math.max(0, 5 - review.stars));
  return (
    <View style={[styles.row, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={styles.head}>
        <View style={[styles.tag, { backgroundColor: palette.okBg }]}>
          <Text style={{ color: palette.ok, fontSize: 12 * baseScale, fontWeight: '700' }}>
            {PROFILE_TAG[review.profile]}
          </Text>
        </View>
        <Text accessibilityLabel={`${review.stars} з 5`} style={{ color: palette.warn, fontSize: 14 * baseScale }}>
          {stars}
        </Text>
      </View>
      {review.text ? (
        <Text style={{ color: palette.text, fontSize: 14 * baseScale, lineHeight: 20 * baseScale }}>{review.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radii.md, padding: space.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tag: { borderRadius: radii.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
});
