import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityFeature, Category, PointSummary } from '@safecity/shared';
import { PointRow } from '@/components/PointRow';
import { Chip, EmptyState, ErrorState, LoadingState, SearchBar } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import {
  CATEGORIES,
  categoryIcon,
  filterPoints,
  MOBILITY_FILTERS,
  suggestFilters,
  type FilterState,
} from '@/lib/filters';
import { categoryLabel } from '@/lib/format';
import { pointsNear } from '@/lib/points';
import { useCity } from '@/state/CityProvider';
import { useProfile } from '@/state/ProfileProvider';
import { space, useTheme } from '@/theme/theme';

export default function PlacesScreen() {
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();
  const { city } = useCity();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [showInaccessible, setShowInaccessible] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, pts] = await Promise.all([
        getCatalog(),
        // Nearest-first with per-row distances (points_near orders by distance_m).
        // Wide radius (~15 km) covers the city bbox used by the map tab.
        pointsNear(city.lng, city.lat, 15000),
      ]);
      setCatalog(cat);
      setPoints(pts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
    // Refetch when the selected city changes; catalog is harmless to reload too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

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
          <Text style={{ color: palette.muted, fontSize: 13 * baseScale, fontWeight: '700' }}>{city.name}</Text>
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

          <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>{filtered.length} місць</Text>
        </View>
      }
      renderItem={({ item }) => <PointRow point={item} catalog={catalog} profile={primary} />}
      ListEmptyComponent={<EmptyState label="Нічого не знайдено. Спробуйте змінити фільтри." />}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
