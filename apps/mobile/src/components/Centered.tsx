import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, theme } from '@/theme/theme';

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.c}>{children}</View>;
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: theme.bg },
});
