import { StyleSheet, Text, View } from 'react-native';
import type { Rating } from '@safecity/shared';
import { ratingMeta, useTheme } from '@/theme/theme';

/** Colored circle + icon for list rows / map pins (rating = color + icon). */
export function RatingDot({ rating, size = 28 }: { rating: Rating; size?: number }) {
  const { palette } = useTheme();
  const meta = ratingMeta[rating];
  const color = { ok: palette.ok, warn: palette.warn, bad: palette.bad, unk: palette.unk }[meta.key];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.5 }}>{meta.icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center' },
});
