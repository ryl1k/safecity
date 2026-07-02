import { StyleSheet, Text, View } from 'react-native';
import { radii, space, useTheme } from '@/theme/theme';
import type { ReviewRow } from '@/lib/reviews';

export function ReviewItem({ review }: { review: ReviewRow }) {
  const { palette, baseScale } = useTheme();
  const stars = '★'.repeat(review.stars) + '☆'.repeat(Math.max(0, 5 - review.stars));
  // SafeCity is wheelchair/mobility-only now — only tag reviews written for that
  // profile; older reviews from the retired blind profile render without a tag
  // rather than showing a now-confusing label.
  return (
    <View style={[styles.row, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={styles.head}>
        {review.profile === 'wheelchair' ? (
          <View style={[styles.tag, { backgroundColor: palette.okBg }]}>
            <Text style={{ color: palette.ok, fontSize: 12 * baseScale, fontWeight: '700' }}>візок</Text>
          </View>
        ) : null}
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
