import { ActivityIndicator, Text } from 'react-native';
import { space, useTheme } from '@/theme/theme';
import { Centered } from '../Centered';
import { Button } from './Button';

export function LoadingState({ label }: { label?: string }) {
  const { palette, baseScale } = useTheme();
  return (
    <Centered>
      <ActivityIndicator color={palette.primary} />
      {label ? <Text style={{ color: palette.muted, marginTop: space.md, fontSize: 15 * baseScale }}>{label}</Text> : null}
    </Centered>
  );
}

export function ErrorState({ label, onRetry }: { label: string; onRetry?: () => void }) {
  const { palette, baseScale } = useTheme();
  return (
    <Centered>
      <Text accessibilityRole="alert" style={{ color: palette.text, textAlign: 'center', fontSize: 16 * baseScale }}>
        {label}
      </Text>
      {onRetry ? <Button title="Спробувати ще" variant="secondary" onPress={onRetry} style={{ marginTop: space.lg }} /> : null}
    </Centered>
  );
}

export function EmptyState({ label }: { label: string }) {
  const { palette, baseScale } = useTheme();
  return (
    <Centered>
      <Text style={{ color: palette.muted, textAlign: 'center', fontSize: 16 * baseScale }}>{label}</Text>
    </Centered>
  );
}
