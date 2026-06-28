import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { PointSummary } from '@safecity/shared';
import { Centered } from '@/components/Centered';
import { PointsMap } from '@/components/PointsMap';
import { pointsInBbox } from '@/lib/points';
import { space, theme } from '@/theme/theme';

// Central Lviv bounding box.
const BBOX = { minLng: 23.9, minLat: 49.78, maxLng: 24.15, maxLat: 49.92 };

export default function MapScreen() {
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
        <Text style={{ color: theme.muted }}>Не вдалося завантажити мапу</Text>
      </Centered>
    );
  }

  return (
    <View style={styles.fill}>
      <PointsMap points={points} />
      {status === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: space.lg,
    alignSelf: 'center',
    backgroundColor: theme.surface,
    borderRadius: 999,
    padding: space.sm,
  },
});
