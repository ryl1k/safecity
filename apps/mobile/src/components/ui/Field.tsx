import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radii, space, useTheme } from '@/theme/theme';

interface Props extends TextInputProps {
  label: string;
  help?: string;
  error?: string;
}

/** Labelled text input — label always present, error announced under the field (KB 11). */
export function Field({ label, help, error, style, ...rest }: Props) {
  const { palette, baseScale } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.text, fontSize: 14 * baseScale }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          {
            backgroundColor: palette.surface,
            borderColor: error ? palette.bad : palette.border,
            color: palette.text,
            fontSize: 16 * baseScale,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[styles.msg, { color: palette.bad, fontSize: 13 * baseScale }]}>{error}</Text>
      ) : help ? (
        <Text style={[styles.msg, { color: palette.muted, fontSize: 13 * baseScale }]}>{help}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  msg: {},
});
