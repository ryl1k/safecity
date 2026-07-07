import { StyleSheet, Text, View } from 'react-native';
import type { ProblemStatus } from '@safecity/shared';
import { radii, space, useTheme, type Palette } from '@/theme/theme';

// Status → palette colour key (fg / `${key}Bg` / `${key}Line`). Mirrors web StatusPill.
const meta: Record<ProblemStatus, { label: string; key: 'unk' | 'warn' | 'bad' | 'ok' }> = {
  reported: { label: 'Повідомлено', key: 'unk' },
  confirmed: { label: 'Підтверджено', key: 'warn' },
  escalated: { label: 'Передано місту', key: 'bad' },
  resolved: { label: 'Вирішено', key: 'ok' },
};

export function StatusPill({ status }: { status: ProblemStatus }) {
  const { palette, baseScale } = useTheme();
  const m = meta[status];
  const fg = palette[m.key as keyof Palette];
  const bg = palette[`${m.key}Bg` as keyof Palette];
  const line = palette[`${m.key}Line` as keyof Palette];
  return (
    <View
      accessibilityLabel={m.label}
      style={[styles.pill, { backgroundColor: bg, borderColor: line }]}
    >
      <Text style={{ color: fg, fontWeight: '800', fontSize: 12 * baseScale }}>{m.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
});
