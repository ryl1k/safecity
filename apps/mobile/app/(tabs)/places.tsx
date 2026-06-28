import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text } from 'react-native';
import type { AccessibilityFeature, PointSummary } from '@safecity/shared';
import { Centered } from '@/components/Centered';
import { PointRow } from '@/components/PointRow';
import { getCatalog } from '@/lib/catalog';
import { pointsNear } from '@/lib/points';
import { space, theme } from '@/theme/theme';

const LVIV = { lng: 24.0316, lat: 49.8419 };

export default function PlacesScreen() {
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    Promise.all([getCatalog(), pointsNear(LVIV.lng, LVIV.lat, 4000)])
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
  }, []);

  if (status === 'loading') {
    return (
      <Centered>
        <ActivityIndicator color={theme.primary} />
      </Centered>
    );
  }
  if (status === 'error') {
    return (
      <Centered>
        <Text style={{ color: theme.muted }}>Не вдалося завантажити місця</Text>
      </Centered>
    );
  }

  return (
    <FlatList
      data={points}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md, backgroundColor: theme.bg, flexGrow: 1 }}
      renderItem={({ item }) => <PointRow point={item} catalog={catalog} profile="wheelchair" />}
      ListEmptyComponent={
        <Centered>
          <Text style={{ color: theme.muted }}>Поки що немає місць поруч</Text>
        </Centered>
      }
    />
  );
}
