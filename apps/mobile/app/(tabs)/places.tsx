import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text } from 'react-native';
import type { AccessibilityFeature, PointSummary } from '@safecity/shared';
import { Centered } from '@/components/Centered';
import { PointRow } from '@/components/PointRow';
import { getCatalog } from '@/lib/catalog';
import { pointsNear } from '@/lib/points';
import { useProfile } from '@/state/ProfileProvider';
import { space, useTheme } from '@/theme/theme';

const LVIV = { lng: 24.0316, lat: 49.8419 };

export default function PlacesScreen() {
  const { palette } = useTheme();
  const { primary } = useProfile();
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
        <ActivityIndicator color={palette.primary} />
      </Centered>
    );
  }
  if (status === 'error') {
    return (
      <Centered>
        <Text style={{ color: palette.muted }}>Не вдалося завантажити місця</Text>
      </Centered>
    );
  }

  return (
    <FlatList
      data={points}
      keyExtractor={(p) => p.id}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      renderItem={({ item }) => <PointRow point={item} catalog={catalog} profile={primary} />}
      ListEmptyComponent={
        <Centered>
          <Text style={{ color: palette.muted }}>Поки що немає місць поруч</Text>
        </Centered>
      }
    />
  );
}
