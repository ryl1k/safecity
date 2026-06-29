import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme/theme';

export function Centered({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <View style={[styles.c, { backgroundColor: palette.bg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
