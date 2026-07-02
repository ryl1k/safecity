import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { AccessibilityFeature, Category, PointSummary } from '@safecity/shared';
import { PointsMap, type MapMarkerData } from '@/components/PointsMap';
import { EmptyState, ErrorState, SearchBar } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { categoryIcon, filterPoints, isAccessible } from '@/lib/filters';
import { pointsInBbox } from '@/lib/points';
import { CITIES, cityBbox, type City } from '@/lib/cities';
import { useCity } from '@/state/CityProvider';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function MapScreen() {
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();
  const { city, setCity } = useCity();
  const router = useRouter();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showInaccessible, setShowInaccessible] = useState(false);

  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [pointQuery, setPointQuery] = useState('');
  const [reload, setReload] = useState(0);

  // Catalog + points load together under one status: a catalog failure must
  // surface as an error (with catalog=[] every point rates 'unknown' and the
  // default filter would hide all markers). Points are scoped to the selected
  // city's bbox — refetch on city change; `reload` drives the retry button.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const bbox = cityBbox(city);
    Promise.all([getCatalog(), pointsInBbox(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat)])
      .then(([cat, pts]) => {
        if (alive) {
          setCatalog(cat);
          setPoints(pts);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [city, reload]);

  const markers = useMemo<MapMarkerData[]>(() => {
    return points
      .map((p) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        category: p.category,
        name: p.name,
        accessible: isAccessible(p, catalog, primary),
      }))
      // Default: only mobility-accessible points; toggle reveals the rest.
      .filter((m) => showInaccessible || m.accessible);
  }, [points, catalog, primary, showInaccessible]);

  // Floating point search — filters the already-loaded points client-side
  // via the shared filterPoints (name + address, same as the places tab).
  // Returns null below the 2-char threshold so the JSX gate has one home.
  const searchResults = useMemo(() => {
    const q = pointQuery.trim();
    if (q.length < 2) return null;
    return filterPoints(points, catalog, primary, {
      query: q,
      categories: new Set<Category>(),
      features: new Set<string>(),
      showInaccessible: true,
    }).slice(0, 6);
  }, [pointQuery, points, catalog, primary]);

  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.oblast.toLowerCase().includes(q));
  }, [citySearch]);

  function pickCity(c: City) {
    setCity(c.id);
    setCityModalOpen(false);
    setCitySearch('');
  }

  function pickSearchResult(p: PointSummary) {
    setPointQuery('');
    router.push(`/point/${p.id}`);
  }

  // Stable props so the memoized PointsMap doesn't re-render (and re-reconcile
  // the native map + markers) on every keystroke in the floating search.
  const center = useMemo<[number, number]>(() => [city.lng, city.lat], [city]);
  const onSelectPoint = useCallback((id: string) => router.push(`/point/${id}`), [router]);

  if (status === 'error') {
    return <ErrorState label="Не вдалося завантажити мапу" onRetry={() => setReload((n) => n + 1)} />;
  }

  return (
    <View style={styles.fill}>
      <PointsMap markers={markers} center={center} onSelect={onSelectPoint} />

      {/* Floating controls: show-inaccessible toggle + city picker + point search. */}
      <View style={styles.floatingTop} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: showInaccessible }}
            accessibilityLabel={showInaccessible ? 'Сховати недоступні місця' : 'Показати недоступні місця'}
            onPress={() => setShowInaccessible((v) => !v)}
            style={[
              styles.pill,
              {
                backgroundColor: showInaccessible ? palette.primary : palette.surface,
                borderColor: showInaccessible ? palette.primary : palette.border,
              },
            ]}
          >
            <Text style={{ color: showInaccessible ? palette.onPrimary : palette.text, fontWeight: '700', fontSize: 13 * baseScale }}>
              {showInaccessible ? '✓ Недоступні' : 'Показати недоступні'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Місто: ${city.name}. Торкніться, щоб змінити місто.`}
            onPress={() => setCityModalOpen(true)}
            style={[styles.pill, styles.cityPill, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Ionicons name="location-outline" size={15 * baseScale} color={palette.text} />
            <Text numberOfLines={1} style={{ color: palette.text, fontWeight: '700', fontSize: 13 * baseScale, maxWidth: 140 }}>
              {city.name}
            </Text>
          </Pressable>

          {status === 'loading' ? <ActivityIndicator color={palette.primary} /> : null}
        </View>

        <View style={styles.searchWrap}>
          <SearchBar value={pointQuery} onChangeText={setPointQuery} placeholder="Пошук місць на мапі…" />
          {/* In normal flow (not absolutely positioned): on Android, touches
              outside an ancestor's layout bounds aren't dispatched, so an
              absolute dropdown below the search bar would not be tappable. */}
          {searchResults !== null ? (
            <View style={[styles.resultsBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              {searchResults.length === 0 ? (
                <Text style={{ color: palette.muted, padding: space.md, fontSize: 13 * baseScale }}>Нічого не знайдено</Text>
              ) : (
                searchResults.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                    onPress={() => pickSearchResult(p)}
                    style={styles.resultRow}
                  >
                    <MaterialCommunityIcons name={categoryIcon[p.category] as MciName} size={16 * baseScale} color={palette.primary} />
                    <Text numberOfLines={1} style={{ flex: 1, color: palette.text, fontSize: 14 * baseScale }}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </View>
      </View>

      {/* City picker modal — search + scrollable list of all 75 cities. */}
      <Modal visible={cityModalOpen} animationType="slide" onRequestClose={() => setCityModalOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.modalContainer, { backgroundColor: palette.bg }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: palette.text, fontSize: 18 * baseScale }]}>Оберіть місто</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрити вибір міста"
              onPress={() => setCityModalOpen(false)}
              style={styles.modalClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22 * baseScale} color={palette.text} />
            </Pressable>
          </View>
          <View style={styles.modalSearch}>
            <SearchBar value={citySearch} onChangeText={setCitySearch} placeholder="Пошук міста чи області…" />
          </View>
          <FlatList
            data={filteredCities}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.cityListContent}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === city.id }}
                accessibilityLabel={`${item.name} — ${item.oblast}${item.id === city.id ? ', обрано' : ''}`}
                onPress={() => pickCity(item)}
                style={[
                  styles.cityRow,
                  {
                    borderColor: palette.border,
                    backgroundColor: item.id === city.id ? palette.primaryTint : palette.surface,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontWeight: '700', fontSize: 15 * baseScale }}>{item.name}</Text>
                  <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>{item.oblast}</Text>
                </View>
                {item.id === city.id ? <Ionicons name="checkmark" size={18 * baseScale} color={palette.primary} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<EmptyState label="Нічого не знайдено" />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  floatingTop: { position: 'absolute', top: 0, left: 0, right: 0, padding: space.lg, gap: space.sm },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  pill: {
    minHeight: 40,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  cityPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchWrap: { gap: space.xs },
  resultsBox: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  modalTitle: { fontWeight: '800' },
  modalClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modalSearch: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  // flexGrow so EmptyState's flex:1 Centered fills the list when empty.
  cityListContent: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xs, flexGrow: 1 },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
});
