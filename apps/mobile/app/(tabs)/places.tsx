import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { PointRow } from '@/components/PointRow';
import { Button, Chip, EmptyState, ErrorState, LoadingState, SearchBar } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import {
  CATEGORIES,
  categoryIcon,
  filterPoints,
  MOBILITY_FILTERS,
  suggestFilters,
  type FilterState,
} from '@/lib/filters';
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

export default function PlacesScreen() {
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [showInaccessible, setShowInaccessible] = useState(false);
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
  useEffect(() => () => stopSpeech(), []);

  const state: FilterState = { query, categories, features, showInaccessible };
  const filtered = useMemo(
    () => filterPoints(points, catalog, primary, state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, catalog, primary, query, categories, features, showInaccessible],
  );

  // Smart-search: suggest filters matching the query that aren't already applied.
  const suggestions = useMemo(() => {
    const s = suggestFilters(query);
    return {
      categories: s.categories.filter((c) => !categories.has(c)),
      features: s.features.filter((f) => !features.has(f.id)),
    };
  }, [query, categories, features]);

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  }

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
    speak(`Знайдено ${filtered.length} місць. ${items.join(' ')}`, {
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
  }

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState label="Не вдалося завантажити місця" onRetry={load} />;

  const hasSuggestions = suggestions.categories.length > 0 || suggestions.features.length > 0;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(p) => p.id}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.xs }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Пошук місця, категорії чи зручності…" />

          {/* Smart-search: tap a suggestion to turn it into a filter */}
          {hasSuggestions ? (
            <View style={styles.chips}>
              {suggestions.categories.map((c) => (
                <Chip
                  key={`s-${c}`}
                  icon={categoryIcon[c]}
                  label={`+ ${categoryLabel[c]}`}
                  onPress={() => {
                    setCategories((s) => toggle(s, c));
                    setQuery('');
                  }}
                />
              ))}
              {suggestions.features.map((f) => (
                <Chip
                  key={`s-${f.id}`}
                  icon={f.icon}
                  label={`+ ${f.label}`}
                  onPress={() => {
                    setFeatures((s) => toggle(s, f.id));
                    setQuery('');
                  }}
                />
              ))}
            </View>
          ) : null}

          {/* Category filters */}
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                icon={categoryIcon[c]}
                label={categoryLabel[c]}
                selected={categories.has(c)}
                onPress={() => setCategories((s) => toggle(s, c))}
              />
            ))}
          </View>

          {/* Mobility feature filters */}
          <View style={styles.chips}>
            {MOBILITY_FILTERS.map((f) => (
              <Chip
                key={f.id}
                icon={f.icon}
                label={f.label}
                selected={features.has(f.id)}
                onPress={() => setFeatures((s) => toggle(s, f.id))}
              />
            ))}
          </View>

          <View style={styles.chips}>
            <Chip
              label={showInaccessible ? '✓ Показано недоступні' : 'Показати недоступні'}
              selected={showInaccessible}
              onPress={() => setShowInaccessible((v) => !v)}
            />
          </View>

          <View style={styles.headRow}>
            <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>{filtered.length} місць</Text>
            {filtered.length > 0 ? (
              <Button
                title={speaking ? '⏹ Зупинити' : '🔊 Озвучити'}
                variant={speaking ? 'primary' : 'secondary'}
                onPress={toggleSpeak}
                accessibilityLabel={speaking ? 'Зупинити озвучення' : 'Озвучити знайдені місця'}
              />
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item }) => <PointRow point={item} catalog={catalog} profile={primary} />}
      ListEmptyComponent={<EmptyState label="Нічого не знайдено. Спробуйте змінити фільтри." />}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
});
