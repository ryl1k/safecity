import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AccessibilityFeature, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { PointsMap, type MapMarkerData } from '@/components/PointsMap';
import { problemsInBbox, type ProblemMarker } from '@/lib/civic';
import { categoryLabel, clockDirection, distanceLabel } from '@/lib/format';
import { getCatalog } from '@/lib/catalog';
import { getCurrentLocation } from '@/lib/location';
import { pointsNear } from '@/lib/points';
import { speak, stopSpeech } from '@/lib/tts';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

const RATING_WORD: Record<Rating, string> = {
  full: 'доступно',
  partial: 'частково доступно',
  none: 'недоступно',
  unknown: 'немає даних',
};

export default function WalkScreen() {
  const router = useRouter();
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();

  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [barriers, setBarriers] = useState<ProblemMarker[]>([]);
  const [status, setStatus] = useState<'locating' | 'ready' | 'error'>('locating');
  const [speaking, setSpeaking] = useState(false);
  const autoSpoke = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const here = await getCurrentLocation();
        if (!alive) return;
        setLoc(here);
        const d = 0.01;
        const [cat, near, probs] = await Promise.all([
          getCatalog(),
          pointsNear(here[0], here[1], 800),
          problemsInBbox(here[0] - d, here[1] - d, here[0] + d, here[1] + d).catch(() => []),
        ]);
        if (!alive) return;
        setCatalog(cat);
        setPoints(near);
        setBarriers(probs.filter((p) => p.status === 'confirmed' || p.status === 'escalated'));
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => stopSpeech(), []);

  const rated = useMemo(
    () => points.map((p) => ({ point: p, rating: computeRating(p.features, catalog, p.category, primary) })),
    [points, catalog, primary],
  );

  const markers = useMemo<MapMarkerData[]>(
    () => rated.map(({ point, rating }) => ({ id: point.id, lng: point.lng, lat: point.lat, category: point.category, rating })),
    [rated],
  );

  function announcement(): string {
    if (!loc) return '';
    const items = rated.slice(0, 6).map(({ point, rating }, i) => {
      const dir = clockDirection(loc[0], loc[1], point.lng, point.lat);
      return `${i + 1}. ${point.name}, ${categoryLabel[point.category]}, ${distanceLabel(point.distanceM)}, ${RATING_WORD[rating]}, на ${dir} годину.`;
    });
    const head = `Поруч ${rated.length} доступних місць.`;
    const barrierText = barriers.length
      ? ` Увага: ${barriers.length} підтверджених бар’єрів поблизу.`
      : '';
    return `${head} ${items.join(' ')}${barrierText}`;
  }

  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(announcement(), { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
  }

  // Blind-first: auto-announce once data is ready.
  useEffect(() => {
    if (status === 'ready' && primary === 'blind' && !autoSpoke.current) {
      autoSpoke.current = true;
      toggleSpeak();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, primary]);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {status === 'ready' && loc ? (
        <PointsMap markers={markers} me={loc} center={loc} zoom={16} onSelect={(id) => router.push(`/point/${id}`)} />
      ) : (
        <View style={[styles.fill, styles.centered]}>
          {status === 'error' ? (
            <Text style={{ color: palette.muted, fontSize: 16 * baseScale }}>Не вдалося визначити місце</Text>
          ) : (
            <>
              <ActivityIndicator color={palette.primary} />
              <Text style={{ color: palette.muted, fontSize: 15 * baseScale, marginTop: space.md }}>Визначаємо місце…</Text>
            </>
          )}
        </View>
      )}

      {/* Exit button (over the map) */}
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вийти з режиму прогулянки"
          onPress={() => router.back()}
          style={[styles.exit, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 16 * baseScale }}>‹ Вийти</Text>
        </Pressable>
      </SafeAreaView>

      {/* Audio-first control panel */}
      <SafeAreaView edges={['bottom']} style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={{ color: palette.text, fontWeight: '800', fontSize: 18 * baseScale }}>Поруч</Text>
          <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>
            {status === 'ready' ? `${rated.length} місць · ${barriers.length} бар’єрів` : 'Завантаження…'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: status !== 'ready' }}
            accessibilityLabel={speaking ? 'Зупинити озвучення' : 'Озвучити місця поруч'}
            disabled={status !== 'ready'}
            onPress={toggleSpeak}
            style={[
              styles.speakBtn,
              { backgroundColor: speaking ? palette.accent : palette.primary, opacity: status === 'ready' ? 1 : 0.5 },
            ]}
          >
            <Text style={{ color: palette.onPrimary, fontWeight: '800', fontSize: 18 * baseScale }}>
              {speaking ? '⏹  Зупинити' : '🔊  Озвучити поруч'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, padding: space.md },
  exit: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.md },
  panel: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg, gap: space.sm },
  speakBtn: {
    minHeight: 60,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
});
