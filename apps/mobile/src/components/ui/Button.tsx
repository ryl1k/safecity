import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radii, space, useTheme, type Palette } from '@/theme/theme';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function variantColors(p: Palette): Record<ButtonVariant, { bg: string; fg: string; border: string }> {
  return {
    primary: { bg: p.primary, fg: p.onPrimary, border: p.primary },
    accent: { bg: p.accent, fg: '#fff', border: p.accent },
    secondary: { bg: p.surface, fg: p.text, border: p.borderStrong },
    ghost: { bg: 'transparent', fg: p.primary, border: 'transparent' },
    danger: { bg: p.bad, fg: '#fff', border: p.bad },
  };
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, accessibilityLabel }: Props) {
  const { palette, baseScale } = useTheme();
  const v = variantColors(palette)[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.label, { color: v.fg, fontSize: 16 * baseScale }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  label: { fontWeight: '800' },
});
