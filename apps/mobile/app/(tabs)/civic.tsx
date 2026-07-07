import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { EmptyState, ErrorState, LoadingState, StatusPill } from '@/components/ui';
import { listProblems, type ProblemRow } from '@/lib/civic';
import { radii, space, useTheme } from '@/theme/theme';

export default function CivicScreen() {
  const { palette, baseScale } = useTheme();
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setProblems(await listProblems());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // Refetch on focus so confirmations / new reports show up after returning.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (status === 'loading') return <LoadingState label="Завантаження проблем" />;
  if (status === 'error') return <ErrorState label="Не вдалося завантажити" onRetry={load} />;

  return (
    <FlatList
      data={problems}
      keyExtractor={(p) => p.id}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: space.xs, marginBottom: space.xs }}>
          <Text style={[styles.h1, { color: palette.text, fontSize: 24 * baseScale }]}>Громадські проблеми</Text>
          <Text style={{ color: palette.muted, fontSize: 14 * baseScale, lineHeight: 20 * baseScale }}>
            Повідомляйте про бар’єри, підтверджуйте чужі повідомлення й передавайте їх місту через петиції.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${item.confirmations} підтверджень`}
          onPress={() => router.push(`/problem/${item.id}`)}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.topRow}>
            <StatusPill status={item.status} />
            <Text style={{ marginLeft: 'auto', color: palette.muted, fontWeight: '700', fontSize: 12 * baseScale }}>
              {item.confirmations} підтверджень
            </Text>
          </View>
          <Text style={{ color: palette.text, fontWeight: '800', fontSize: 16 * baseScale, marginTop: space.sm }}>
            {item.title}
          </Text>
          {item.pointName ? (
            <Text style={{ color: palette.muted, fontSize: 13 * baseScale, marginTop: 2 }}>{item.pointName}</Text>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <EmptyState label="Поки немає проблем. Повідомте про перший бар’єр зі сторінки місця." />
      }
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
