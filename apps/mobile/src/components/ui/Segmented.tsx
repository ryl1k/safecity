import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, space, useTheme } from '@/theme/theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const { palette, baseScale } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: palette.surface2, borderColor: palette.border }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.item, on && { backgroundColor: palette.primary }]}
          >
            <Text style={{ color: on ? palette.onPrimary : palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderRadius: radii.md, padding: 2, gap: 2 },
  item: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: space.sm },
});
