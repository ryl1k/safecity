import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { AccessibilityFeature, PointSummary } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { Centered } from '@/components/Centered';
import { PointsMap, type MapMarkerData } from '@/components/PointsMap';
import { getCatalog } from '@/lib/catalog';
import { pointsInBbox } from '@/lib/points';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

// Central Lviv bounding box.
const BBOX = { minLng: 23.9, minLat: 49.78, maxLng: 24.15, maxLat: 49.92 };

export default function MapScreen() {
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();
  const router = useRouter();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    Promise.all([getCatalog(), pointsInBbox(BBOX.minLng, BBOX.minLat, BBOX.maxLng, BBOX.maxLat)])
      .then(([cat, p]) => {
        if (alive) {
          setCatalog(cat);
          setPoints(p);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const markers = useMemo<MapMarkerData[]>(
    () =>
      points.map((p) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        category: p.category,
        rating: computeRating(p.features, catalog, p.category, primary),
      })),
    [points, catalog, primary],
  );

  if (status === 'error') {
    return (
      <Centered>
        <Text style={{ color: palette.muted }}>Не вдалося завантажити мапу</Text>
      </Centered>
    );
  }

  return (
    <View style={styles.fill}>
      <PointsMap markers={markers} onSelect={(id) => router.push(`/point/${id}`)} />
      {status === 'loading' ? (
        <View style={[styles.overlay, { backgroundColor: palette.surface }]} pointerEvents="none">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Режим прогулянки — озвучити що поруч"
        onPress={() => router.push('/walk')}
        style={[styles.fab, { backgroundColor: palette.primary, borderColor: palette.onPrimary }]}
      >
        <Ionicons name="walk" size={20 * baseScale} color={palette.onPrimary} />
        <Text style={{ color: palette.onPrimary, fontWeight: '800', fontSize: 15 * baseScale }}>Поруч</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: space.lg, alignSelf: 'center', borderRadius: 999, padding: space.sm },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

