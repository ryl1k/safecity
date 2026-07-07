import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radii, space, useTheme } from '@/theme/theme';

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
}) {
  const { palette, baseScale } = useTheme();
  const fg = selected ? palette.onPrimary : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? palette.primary : palette.surface,
          borderColor: selected ? palette.primary : palette.border,
        },
      ]}
    >
      <View style={styles.row}>
        {icon ? <MaterialCommunityIcons name={icon as MciName} size={16 * baseScale} color={fg} /> : null}
        <Text style={{ color: fg, fontWeight: '700', fontSize: 14 * baseScale }}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
