import { StyleSheet, Text, View } from 'react-native';
import type { Rating } from '@safecity/shared';
import { radii, ratingMeta, space, theme } from '@/theme/theme';

// Rating = color + icon + label (never color alone) — KB 11 a11y rule.
const colors = {
  ok: { fg: theme.ok, bg: theme.okBg, line: theme.okLine },
  warn: { fg: theme.warn, bg: theme.warnBg, line: theme.warnLine },
  bad: { fg: theme.bad, bg: theme.badBg, line: theme.badLine },
  unk: { fg: theme.unk, bg: theme.unkBg, line: theme.unkLine },
} as const;

export function RatingBadge({ rating }: { rating: Rating }) {
  const meta = ratingMeta[rating];
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
