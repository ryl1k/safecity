import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@maplibre/maplibre-react-native';
import type { PointSummary } from '@safecity/shared';
import { Button, ErrorState, LoadingState } from '@/components/ui';
import { MAP_TILE_URL } from '@/lib/env';
import { distanceLabel } from '@/lib/format';
import { getCurrentLocation } from '@/lib/location';
import { pointById } from '@/lib/points';
import { getRoute, RoutingUnavailableError, type RouteStep } from '@/lib/routing';
import { speak, stopSpeech } from '@/lib/tts';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

export default function RouteScreen() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const router = useRouter();
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [dest, setDest] = useState<PointSummary | null>(null);
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  async function plan() {
    if (!to) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const point = await pointById(to);
      if (!point) {
        setStatus('error');
        return;
      }
      setDest(point);
      const start = await getCurrentLocation();
      const res = await getRoute(start, [point.lng, point.lat], primary);
      setLine(res.coordinates);
      setSteps(res.steps);
      setSummary(res.summary);
      setFallback(res.fallback);
      setAvoided(res.avoided);
      setStatus('ready');
    } catch (e) {
      setStatus(e instanceof RoutingUnavailableError ? 'unavailable' : 'error');
    }
  }

  useEffect(() => {
    void plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, primary]);

  useEffect(() => () => stopSpeech(), []);

  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    if (steps.length === 0) return;
    setSpeaking(true);
    speak(steps.map((s) => s.instruction).join('. '), {
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
  }

  const mapStyle = useMemo(
    () =>
      JSON.stringify({
        version: 8,
        sources: {
          osm: { type: 'raster', tiles: [MAP_TILE_URL], tileSize: 256, attribution: '© OpenStreetMap' },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      }),
    [],
  );

  const lineGeoJSON = useMemo(
    () => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } }),
    [line],
  );

  const Header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: palette.surface }}>
      <View style={[styles.bar, { borderBottomColor: palette.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: palette.primary, fontSize: 17 * baseScale, fontWeight: '700' }}>‹ Назад</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <LoadingState label="Прокладання маршруту" />
      </View>
    );
  }
  if (status === 'unavailable') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <ErrorState label="Маршрутизація недоступна без під’єднання до сервера SafeCity." />
      </View>
    );
  }
  if (status === 'error' || !dest) {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <ErrorState label="Не вдалося прокласти маршрут" onRetry={plan} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { color: palette.text, fontSize: 20 * baseScale }]}>Маршрут до «{dest.name}»</Text>
        <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>
          {primary === 'blind' ? 'Пішохідний маршрут' : 'Маршрут без сходів'}
        </Text>

        {fallback ? (
          <View style={[styles.banner, { backgroundColor: palette.warnBg, borderColor: palette.warnLine }]}>
            <Text style={{ color: palette.warn, fontWeight: '700', fontSize: 13 * baseScale }}>
              Пішохідний маршрут — детальних даних для крісла колісного на цьому відрізку бракує.
            </Text>
          </View>
        ) : null}
        {avoided > 0 ? (
          <View style={[styles.banner, { backgroundColor: palette.primaryTint, borderColor: palette.primary }]}>
            <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 13 * baseScale }}>
              Оминаємо {avoided} підтверджених бар’єр(и) на шляху.
            </Text>
          </View>
        ) : null}

        <View style={[styles.mapBox, { borderColor: palette.border }]}>
          <MapView style={styles.map} mapStyle={mapStyle}>
            <Camera defaultSettings={{ centerCoordinate: [dest.lng, dest.lat], zoomLevel: 14 }} />
            {line.length > 1 ? (
              <ShapeSource id="route" shape={lineGeoJSON}>
                <LineLayer
                  id="route-line"
                  style={{ lineColor: palette.primary, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
                />
              </ShapeSource>
            ) : null}
            <PointAnnotation id="dest" coordinate={[dest.lng, dest.lat]}>
              <View style={[styles.pin, { backgroundColor: palette.accent, borderColor: palette.onPrimary }]} />
            </PointAnnotation>
          </MapView>
        </View>

        <View style={styles.summaryRow}>
          {summary ? (
            <Text style={{ color: palette.text, fontWeight: '800', fontSize: 16 * baseScale }}>
              {distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв
            </Text>
          ) : null}
          {steps.length > 0 ? (
            <Button
              title={speaking ? '⏹ Зупинити' : '🔊 Озвучити'}
              variant={speaking ? 'primary' : 'accent'}
              onPress={toggleSpeak}
              accessibilityLabel={speaking ? 'Зупинити озвучення' : 'Озвучити маршрут'}
              style={{ marginLeft: 'auto' }}
            />
          ) : null}
        </View>

        <View style={[styles.steps, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {steps.length === 0 ? (
            <Text style={{ color: palette.muted, fontSize: 14 * baseScale, padding: space.md }}>Кроків немає.</Text>
          ) : (
            steps.map((s, i) => (
              <View
                key={i}
                style={[styles.step, i ? { borderTopWidth: 1, borderTopColor: palette.border } : null]}
              >
                <View style={[styles.num, { backgroundColor: palette.primaryTint }]}>
                  <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 12 * baseScale }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: palette.text, fontSize: 14 * baseScale }}>{s.instruction}</Text>
                <Text style={{ color: palette.muted, fontSize: 12 * baseScale }}>{distanceLabel(s.distance)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.sm },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  content: { padding: space.lg, gap: space.md },
  h1: { fontWeight: '800' },
  banner: { borderWidth: 1, borderRadius: radii.md, padding: space.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  mapBox: { height: 280, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  map: { flex: 1 },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  steps: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
