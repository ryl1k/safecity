import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, space, useTheme } from '@/theme/theme';

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  onSubmit?: () => void;
}) {
  const { palette, baseScale } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={{ color: palette.muted, fontSize: 16 * baseScale }}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={[styles.input, { color: palette.text, fontSize: 16 * baseScale }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  input: { flex: 1, paddingVertical: space.sm },
});
