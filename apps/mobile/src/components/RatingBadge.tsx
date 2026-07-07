import { StyleSheet, Text, View } from 'react-native';
import type { Rating } from '@safecity/shared';
import { radii, ratingMeta, space, useTheme } from '@/theme/theme';

// Rating = color + icon + label (never color alone) — KB 11 a11y rule.
export function RatingBadge({ rating }: { rating: Rating }) {
  const { palette } = useTheme();
  const meta = ratingMeta[rating];
  const colors = {
    ok: { fg: palette.ok, bg: palette.okBg, line: palette.okLine },
    warn: { fg: palette.warn, bg: palette.warnBg, line: palette.warnLine },
    bad: { fg: palette.bad, bg: palette.badBg, line: palette.badLine },
    unk: { fg: palette.unk, bg: palette.unkBg, line: palette.unkLine },
  } as const;
  const c = colors[meta.key];
  return (
    <View
      accessibilityLabel={`Доступність: ${meta.label}`}
      style={[styles.badge, { backgroundColor: c.bg, borderColor: c.line }]}
    >
      <Text style={[styles.text, { color: c.fg }]}>
        {meta.icon} {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  text: { fontSize: 13, fontWeight: '700' },
});
