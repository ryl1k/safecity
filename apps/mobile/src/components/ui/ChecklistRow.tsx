import { StyleSheet, Text, View } from 'react-native';
import type { FeatureValue } from '@safecity/shared';
import { radii, space, useTheme } from '@/theme/theme';

const VALUE_LABEL: Record<FeatureValue, string> = { yes: 'Так', no: 'Ні', unknown: 'Невідомо' };

/** One accessibility-feature row: yes/no/unknown icon + label (+ ★ if critical). */
export function ChecklistRow({
  label,
  value,
  critical,
  last,
}: {
  label: string;
  value: FeatureValue;
  critical?: boolean;
  last?: boolean;
}) {
  const { palette, baseScale } = useTheme();
  const v = {
    yes: { icon: '✓', color: palette.ok },
    no: { icon: '✕', color: palette.bad },
    unknown: { icon: '?', color: palette.unk },
  }[value];

  return (
    <View
      accessibilityLabel={`${label}${critical ? ', критично' : ''}: ${VALUE_LABEL[value]}`}
      style={[styles.row, { borderBottomColor: palette.border, borderBottomWidth: last ? 0 : 1 }]}
    >
      <View style={[styles.icon, { backgroundColor: v.color }]}>
        <Text style={styles.iconText}>{v.icon}</Text>
      </View>
      <Text style={[styles.label, { color: palette.text, fontSize: 15 * baseScale }]}>
        {label}
        {critical ? <Text style={{ color: palette.accent }}> ★</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  icon: { width: 26, height: 26, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  label: { flex: 1, fontWeight: '600' },
});
