import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { PointRow } from '@/components/PointRow';
import { Button, Chip, EmptyState, ErrorState, LoadingState, SearchBar } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { pointsNear } from '@/lib/points';
import { speak, stopSpeech } from '@/lib/tts';
import { useProfile } from '@/state/ProfileProvider';
import { space, useTheme } from '@/theme/theme';

const RATING_WORD: Record<Rating, string> = {
  full: 'доступно',
  partial: 'частково доступно',
  none: 'недоступно',
  unknown: 'немає даних',
};

const LVIV = { lng: 24.0316, lat: 49.8419 };
const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

export default function PlacesScreen() {
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [query, setQuery] = useState('');
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [speaking, setSpeaking] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, pts] = await Promise.all([getCatalog(), pointsNear(LVIV.lng, LVIV.lat, 4000)]);
      setCatalog(cat);
      setPoints(pts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Stop speech when leaving the screen.
  useEffect(() => () => stopSpeech(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return points.filter((p) => {
      if (category && p.category !== category) return false;
      if (q && !(`${p.name} ${p.address ?? ''}`.toLowerCase().includes(q))) return false;
      if (accessibleOnly) {
        const r = computeRating(p.features, catalog, p.category, primary);
        if (r !== 'full' && r !== 'partial') return false;
      }
      return true;
    });
  }, [points, catalog, primary, query, accessibleOnly, category]);

  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const items = filtered.slice(0, 8).map((p, i) => {
      const rating = computeRating(p.features, catalog, p.category, primary);
      const summary = featureSummary(p, catalog, primary);
      return `${i + 1}. ${p.name}, ${categoryLabel[p.category]}, ${distanceLabel(p.distanceM)}, ${RATING_WORD[rating]}${summary ? `, ${summary}` : ''}.`;
    });
    setSpeaking(true);
    speak(`Поруч ${filtered.length} місць. ${items.join(' ')}`, {
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
  }

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState label="Не вдалося завантажити місця" onRetry={load} />;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(p) => p.id}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.xs }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Пошук за назвою чи адресою…" />
          <View style={styles.chips}>
            <Chip label="Лише доступні" selected={accessibleOnly} onPress={() => setAccessibleOnly((v) => !v)} />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={categoryLabel[c]}
                selected={category === c}
                onPress={() => setCategory((cur) => (cur === c ? null : c))}
              />
            ))}
          </View>
          <View style={styles.headRow}>
            <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>{filtered.length} місць</Text>
            {filtered.length > 0 ? (
              <Button
                title={speaking ? '⏹ Зупинити' : '🔊 Озвучити поруч'}
                variant={speaking ? 'primary' : 'secondary'}
                onPress={toggleSpeak}
                accessibilityLabel={speaking ? 'Зупинити озвучення' : 'Озвучити місця поруч'}
              />
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item }) => <PointRow point={item} catalog={catalog} profile={primary} />}
      ListEmptyComponent={<EmptyState label="Нічого не знайдено" />}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
});
