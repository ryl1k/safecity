import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PointSummary } from '@safecity/shared';
import { Centered } from '@/components/Centered';
import { PointsMap } from '@/components/PointsMap';
import { pointsInBbox } from '@/lib/points';
import { space, useTheme } from '@/theme/theme';

// Central Lviv bounding box.
const BBOX = { minLng: 23.9, minLat: 49.78, maxLng: 24.15, maxLat: 49.92 };

export default function MapScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    pointsInBbox(BBOX.minLng, BBOX.minLat, BBOX.maxLng, BBOX.maxLat)
      .then((p) => {
        if (alive) {
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

  if (status === 'error') {
    return (
      <Centered>
        <Text style={{ color: palette.muted }}>Не вдалося завантажити мапу</Text>
      </Centered>
    );
  }

  return (
    <View style={styles.fill}>
      <PointsMap points={points} onSelect={(id) => router.push(`/point/${id}`)} />
      {status === 'loading' ? (
        <View style={[styles.overlay, { backgroundColor: palette.surface }]} pointerEvents="none">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: space.lg, alignSelf: 'center', borderRadius: 999, padding: space.sm },
});
