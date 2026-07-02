// Route planner — walking (wheelchair-safe, via the SafeCity API) or public
// transport (Transitous, direct — no backend dependency). RN port of the web
// app's RouteTabContent (apps/web/src/components/PointDetailModal.tsx) plus
// the previous point-to-point mobile route screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { AddressField } from '@/components/AddressField';
import { Button, ErrorState, LoadingState, Segmented } from '@/components/ui';
import { distanceLabel } from '@/lib/format';
import { reverseGeocode } from '@/lib/geocode';
import { metersBetween, tryGetCurrentLocation } from '@/lib/location';
import { basemapStyle } from '@/lib/mapStyle';
import { pointById } from '@/lib/points';
import { getRoute, RoutingUnavailableError, type RouteStep } from '@/lib/routing';
import {
  isTransitCovered,
  itineraryCoords,
  legLabel,
  planTransit,
  type TransitItinerary,
} from '@/lib/transit';
import { speak, stopSpeech } from '@/lib/tts';
import { useCity } from '@/state/CityProvider';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme, type Palette } from '@/theme/theme';

type TravelMode = 'walk' | 'transit';
type PlanStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A geolocation seed is only trusted within this distance of the destination
// (or the selected city centre) — beyond that it's a denied-permission fallback
// or a bogus emulator fix, and must not auto-plan a transcontinental route.
const PLAUSIBLE_START_METERS = 50_000;

// Local time formatter: transit.ts's fmtTime builds a fresh Intl.DateTimeFormat
// per call, which is expensive on Hermes and runs ~11× per render here.
const TIME_FMT = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d);
}

// Prebuilt GeoJSON per line (inside useMemo) so <GeoJSONSource data> stays
// referentially stable — an inline literal would re-cross the RN bridge for a
// native re-parse on every keystroke re-render.
function lineFeature(coords: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {} as Record<string, unknown>,
    geometry: { type: 'LineString' as const, coordinates: coords },
  };
}

interface LineSpec {
  id: string;
  data: ReturnType<typeof lineFeature>;
  // Precomputed (not an inline object literal) so it's assigned to <Layer style>
  // via a variable — sidesteps TS's excess-property check on fresh literals,
  // since the exact style-prop union for @maplibre/maplibre-react-native v11
  // couldn't be verified offline (node_modules wasn't installed while porting
  // this screen). lineOpacity/lineDasharray follow the maplibre-gl style spec's
  // line-opacity/line-dasharray, camelCased like the lineColor/lineWidth/lineCap/
  // lineJoin props already used elsewhere in this codebase.
  style: {
    lineColor: string;
    lineWidth: number;
    lineOpacity: number;
    lineCap: 'round';
    lineJoin: 'round';
    lineDasharray?: number[];
  };
}

interface MarkerSpec {
  id: string;
  lng: number;
  lat: number;
  kind: 'start' | 'end' | 'board' | 'alight';
  label: string;
}

function markerDotStyle(kind: MarkerSpec['kind'], palette: Palette): { backgroundColor: string; borderColor: string; borderWidth: number } {
  switch (kind) {
    case 'start':
      return { backgroundColor: palette.surface, borderColor: palette.muted, borderWidth: 3 };
    case 'end':
      return { backgroundColor: palette.bad, borderColor: palette.onPrimary, borderWidth: 2 };
    case 'board':
      return { backgroundColor: palette.primary, borderColor: palette.onPrimary, borderWidth: 2 };
    case 'alight':
      return { backgroundColor: palette.accent, borderColor: palette.onPrimary, borderWidth: 2 };
  }
}

// Bounding box of the given points → a center + zoom heuristic (no verified
// Camera.fitBounds API to hand — node_modules wasn't installed while porting
// this screen, so we stick to the center+zoom shape the rest of the app already
// uses, and remount <Camera> via a key to force a re-fit).
function fitView(
  routeCoords: [number, number][],
  from: [number, number] | null,
  to: [number, number] | null,
  fallbackCenter: [number, number],
): { center: [number, number]; zoom: number; key: string } {
  const pts = routeCoords.length >= 2 ? routeCoords : ([from, to].filter(Boolean) as [number, number][]);
  if (pts.length === 0) {
    return { center: fallbackCenter, zoom: 12, key: `empty:${fallbackCenter[0].toFixed(3)},${fallbackCenter[1].toFixed(3)}` };
  }
  if (pts.length === 1) {
    const p = pts[0]!;
    return { center: p, zoom: 14, key: `1:${p[0].toFixed(4)},${p[1].toFixed(4)}` };
  }
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const latRad = (center[1] * Math.PI) / 180;
  const lngSpan = (maxLng - minLng) * Math.cos(latRad);
  const latSpan = maxLat - minLat;
  const span = Math.max(lngSpan, latSpan, 0.002);
  const zoom = Math.min(16.5, Math.max(11, Math.log2(360 / span) - 1));
  return { center, zoom, key: `${center[0].toFixed(4)},${center[1].toFixed(4)},${zoom.toFixed(2)}` };
}

export default function RouteScreen() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const router = useRouter();
  const { palette, baseScale, themeName } = useTheme();
  const { primary } = useProfile();
  const { city } = useCity();

  // Screen init: resolve the deep-linked destination point, if any.
  const [initStatus, setInitStatus] = useState<'loading' | 'ready' | 'error'>(to ? 'loading' : 'ready');
  const [initAttempt, setInitAttempt] = useState(0); // bump to retry a failed init

  // FROM / TO waypoints.
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [fromLabel, setFromLabel] = useState('');
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [toLabel, setToLabel] = useState('');
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);

  const [travelMode, setTravelMode] = useState<TravelMode>('walk');

  // Walk-mode result.
  const [planStatus, setPlanStatus] = useState<PlanStatus>('idle');
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // Transit-mode result.
  const [transitIts, setTransitIts] = useState<TransitItinerary[]>([]);
  const [selectedIt, setSelectedIt] = useState(0);
  const [transitNotice, setTransitNotice] = useState<string | null>(null);

  const lastPlanKey = useRef(''); // dedupes auto-routing against re-renders
  const transitAbortRef = useRef<AbortController | null>(null);
  const planSeqRef = useRef(0); // stale plan() calls bail instead of committing

  // Live views of state for the mount-once geolocation seed (its closure would
  // otherwise see only the initial values).
  const toCoordsRef = useRef(toCoords);
  toCoordsRef.current = toCoords;
  const cityRef = useRef(city);
  cityRef.current = city;
  const fromTouchedRef = useRef(false); // user typed/selected FROM — seed must not clobber it

  // Pre-fill TO from the deep-linked point.
  useEffect(() => {
    if (!to) {
      setInitStatus('ready');
      return;
    }
    let cancelled = false;
    setInitStatus('loading');
    pointById(to)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setInitStatus('error');
          return;
        }
        setToCoords([p.lng, p.lat]);
        setToLabel(p.name);
        setInitStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setInitStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [to, initAttempt]);

  // Seed FROM from the user's current location — but only when the fix is
  // plausible (within 50 km of the destination, or of the selected city centre
  // when no destination is set yet); permission denial, a timeout, or a bogus
  // fix (e.g. an emulator defaulting to the US) leaves the field empty instead
  // of auto-planning a wrong-city or transcontinental route. Then upgrade the
  // provisional label to a real address unless the user already edited it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const coords = await tryGetCurrentLocation();
      if (cancelled || !coords || fromTouchedRef.current) return;
      const anchor: [number, number] = toCoordsRef.current ?? [cityRef.current.lng, cityRef.current.lat];
      if (metersBetween(coords, anchor) > PLAUSIBLE_START_METERS) return;
      setFromCoords(coords);
      setFromLabel('Моє місцезнаходження');
      const addr = await reverseGeocode(coords[0], coords[1]).catch(() => null);
      if (cancelled || !addr) return;
      setFromLabel((cur) => (cur === 'Моє місцезнаходження' ? addr : cur));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopSpeech(), []);
  useEffect(() => () => transitAbortRef.current?.abort(), []);

  async function plan(from: [number, number], dest: [number, number], mode: TravelMode) {
    // Staleness guard: any newer plan() (or a manual invalidation) bumps the
    // sequence, so a slow request resolving late can't clobber newer results —
    // e.g. a stale walk failure overwriting an already-rendered transit plan.
    const seq = ++planSeqRef.current;
    transitAbortRef.current?.abort();

    if (mode === 'transit') {
      setPlanStatus('loading');
      setTransitNotice(null);
      if (!isTransitCovered(from, dest)) {
        setTransitIts([]);
        setTransitNotice('Маршрути громадським транспортом наразі доступні лише у Львові.');
        setPlanStatus('ready');
        return;
      }
      const ctrl = new AbortController();
      transitAbortRef.current = ctrl;
      try {
        const its = await planTransit(from, dest, ctrl.signal);
        if (ctrl.signal.aborted || seq !== planSeqRef.current) return;
        setTransitIts(its.slice(0, 3)); // only ever show/draw the top 3
        setSelectedIt(0);
        setPlanStatus(its.length ? 'ready' : 'error');
      } catch {
        if (!ctrl.signal.aborted && seq === planSeqRef.current) setPlanStatus('error');
      }
      return;
    }

    setPlanStatus('loading');
    stopSpeech();
    setSpeaking(false);
    try {
      const res = await getRoute(from, dest, primary);
      if (seq !== planSeqRef.current) return;
      setLine(res.coordinates);
      setSteps(res.steps);
      setSummary(res.summary);
      setFallback(res.fallback);
      setAvoided(res.avoided);
      setPlanStatus('ready');
    } catch (e) {
      if (seq !== planSeqRef.current) return;
      setPlanStatus(e instanceof RoutingUnavailableError ? 'unavailable' : 'error');
    }
  }

  // The user hand-edited an address: its stored coords no longer match the
  // text, so drop the displayed result and cancel anything in flight — a route
  // is only shown while both fields are backed by real coords.
  function invalidatePlan() {
    planSeqRef.current++;
    transitAbortRef.current?.abort();
    lastPlanKey.current = '';
    stopSpeech();
    setSpeaking(false);
    setPlanStatus('idle');
    setLine([]);
    setSteps([]);
    setSummary(null);
    setTransitIts([]);
    setTransitNotice(null);
    setSelectedIt(0);
  }

  // Auto-route when both waypoints are ready. Dedupe by the actual waypoint
  // set + mode so re-renders can't fire a storm of identical requests.
  useEffect(() => {
    if (!fromCoords || !toCoords) return;
    const key = `${travelMode}|${primary}|${fromCoords[0]},${fromCoords[1]}|${toCoords[0]},${toCoords[1]}`;
    if (key === lastPlanKey.current) return;
    lastPlanKey.current = key;
    void plan(fromCoords, toCoords, travelMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCoords, toCoords, travelMode, primary]);

  function retryPlan() {
    lastPlanKey.current = '';
    if (fromCoords && toCoords) void plan(fromCoords, toCoords, travelMode);
  }

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

  const mapStyle = useMemo(() => basemapStyle(themeName === 'dark'), [themeName]);

  // Lines to draw: one solid line for walk mode; up to 3 transit itineraries
  // (alternatives muted, selected saturated + rendered last so it's on top).
  const displayLines = useMemo<LineSpec[]>(() => {
    if (travelMode === 'walk') {
      return line.length > 1
        ? [
            {
              id: 'walk',
              data: lineFeature(line),
              style: { lineColor: palette.primary, lineWidth: 5, lineOpacity: 0.9, lineCap: 'round', lineJoin: 'round' },
            },
          ]
        : [];
    }
    const altShades = ['#8fa8c8', '#bccadd'];
    let altIdx = 0;
    const specs: LineSpec[] = [];
    transitIts.forEach((it, i) => {
      const sel = i === selectedIt;
      const color = sel ? palette.primary : altShades[Math.min(altIdx++, altShades.length - 1)]!;
      it.legs.forEach((l, j) => {
        if (l.coords.length < 2) return;
        const dash = l.mode === 'WALK';
        specs.push({
          id: `it${i}-leg${j}`,
          data: lineFeature(l.coords),
          style: {
            lineColor: color,
            lineWidth: sel ? (dash ? 3.5 : 5.5) : dash ? 2 : 3,
            lineOpacity: sel ? 0.95 : 0.5,
            lineCap: 'round',
            lineJoin: 'round',
            ...(dash ? { lineDasharray: [2, 2] } : null),
          },
        });
      });
    });
    // Selected itinerary's lines last so they render on top of alternatives.
    const selPrefix = `it${selectedIt}-`;
    const alt = specs.filter((s) => !s.id.startsWith(selPrefix));
    const sel = specs.filter((s) => s.id.startsWith(selPrefix));
    return [...alt, ...sel];
  }, [travelMode, line, transitIts, selectedIt, palette]);

  // Markers for the active route: start/finish, plus board/alight cues for
  // each transit leg of the selected itinerary.
  const displayMarkers = useMemo<MarkerSpec[]>(() => {
    if (travelMode === 'walk') {
      if (line.length < 2) return [];
      const first = line[0]!, last = line[line.length - 1]!;
      return [
        { id: 'start', lng: first[0], lat: first[1], kind: 'start', label: 'Старт' },
        { id: 'end', lng: last[0], lat: last[1], kind: 'end', label: 'Фініш' },
      ];
    }
    const it = transitIts[selectedIt];
    if (!it) return [];
    const markers: MarkerSpec[] = [];
    const firstLeg = it.legs[0];
    const lastLeg = it.legs[it.legs.length - 1];
    const first = firstLeg?.coords[0];
    const last = lastLeg?.coords[lastLeg.coords.length - 1];
    if (first) markers.push({ id: 'start', lng: first[0], lat: first[1], kind: 'start', label: 'Старт' });
    if (last) markers.push({ id: 'end', lng: last[0], lat: last[1], kind: 'end', label: 'Фініш' });
    it.legs.forEach((l, j) => {
      if (l.mode === 'WALK' || l.coords.length < 2) return;
      const b = l.coords[0]!, a = l.coords[l.coords.length - 1]!;
      markers.push({ id: `board${j}`, lng: b[0], lat: b[1], kind: 'board', label: `Сісти на ${l.route ?? legLabel(l)}` });
      markers.push({
        id: `alight${j}`,
        lng: a[0],
        lat: a[1],
        kind: 'alight',
        label: l.toName ? `Вийти: ${trunc(l.toName, 26)}` : 'Вийти',
      });
    });
    return markers;
  }, [travelMode, line, transitIts, selectedIt]);

  const activeRouteCoords = useMemo(() => {
    if (travelMode === 'walk') return line;
    const it = transitIts[selectedIt];
    return it ? itineraryCoords(it) : [];
  }, [travelMode, line, transitIts, selectedIt]);

  const view = useMemo(
    () => fitView(activeRouteCoords, fromCoords, toCoords, [city.lng, city.lat]),
    [activeRouteCoords, fromCoords, toCoords, city],
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

  if (initStatus === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <LoadingState label="Завантаження" />
      </View>
    );
  }
  if (initStatus === 'error') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <ErrorState label="Не вдалося прокласти маршрут" onRetry={() => setInitAttempt((n) => n + 1)} />
      </View>
    );
  }

  const transitLegend = travelMode === 'transit' && transitIts.length > 0;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { color: palette.text, fontSize: 20 * baseScale }]}>Маршрут</Text>

        <View accessibilityRole="radiogroup" accessibilityLabel="Спосіб пересування">
          <Segmented
            options={[
              { value: 'walk' as TravelMode, label: 'Пішки' },
              { value: 'transit' as TravelMode, label: 'Транспортом' },
            ]}
            value={travelMode}
            onChange={setTravelMode}
          />
        </View>
        {travelMode === 'walk' ? (
          <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>Маршрут без сходів</Text>
        ) : null}

        <View style={{ gap: space.sm }}>
          <AddressField
            placeholder="Звідки…"
            value={fromLabel}
            onChangeText={(v) => {
              fromTouchedRef.current = true;
              setFromLabel(v);
              setFromCoords(null); // text no longer matches the stored coords
              invalidatePlan();
            }}
            onSelect={(coords, label) => {
              fromTouchedRef.current = true;
              setFromCoords(coords);
              setFromLabel(label);
              setActiveField(null);
            }}
            active={activeField === 'from'}
            onActivate={() => setActiveField('from')}
            onDeactivate={() => setActiveField((f) => (f === 'from' ? null : f))}
            accessibilityLabel="Початкова точка маршруту"
          />
          <AddressField
            placeholder="Куди…"
            value={toLabel}
            onChangeText={(v) => {
              setToLabel(v);
              setToCoords(null); // text no longer matches the stored coords
              invalidatePlan();
            }}
            onSelect={(coords, label) => {
              setToCoords(coords);
              setToLabel(label);
              setActiveField(null);
            }}
            active={activeField === 'to'}
            onActivate={() => setActiveField('to')}
            onDeactivate={() => setActiveField((f) => (f === 'to' ? null : f))}
            accessibilityLabel="Кінцева точка маршруту"
          />
        </View>

        <View style={[styles.mapBox, { borderColor: palette.border }]}>
          <Map style={styles.map} mapStyle={mapStyle}>
            <Camera key={view.key} initialViewState={{ center: view.center, zoom: view.zoom }} />
            {displayLines.map((l) => (
              <GeoJSONSource key={l.id} id={`src-${l.id}`} data={l.data}>
                <Layer id={`layer-${l.id}`} type="line" style={l.style} />
              </GeoJSONSource>
            ))}
            {displayMarkers.map((m) => (
              <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]}>
                <View style={styles.markerWrap}>
                  <View style={[styles.dot, markerDotStyle(m.kind, palette)]} />
                  <View style={[styles.markerLabel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text numberOfLines={1} style={[styles.markerLabelText, { color: palette.text }]}>
                      {m.label}
                    </Text>
                  </View>
                </View>
              </Marker>
            ))}
          </Map>
        </View>

        {planStatus === 'idle' ? (
          <Text style={{ color: palette.muted, fontSize: 13 * baseScale, textAlign: 'center', paddingVertical: space.sm }}>
            Вкажіть початок і кінець маршруту.
          </Text>
        ) : null}

        {planStatus === 'loading' ? <LoadingState label="Прокладання маршруту" /> : null}

        {planStatus === 'unavailable' ? (
          <ErrorState label="Маршрутизація недоступна без під’єднання до сервера SafeCity." />
        ) : null}

        {planStatus === 'error' ? (
          <ErrorState
            label={travelMode === 'transit' ? 'Маршрутів транспортом не знайдено' : 'Не вдалося прокласти маршрут'}
            onRetry={retryPlan}
          />
        ) : null}

        {planStatus === 'ready' && travelMode === 'transit' ? (
          <View style={{ gap: space.sm }}>
            {transitNotice ? (
              <View style={[styles.banner, { backgroundColor: palette.primaryTint, borderColor: palette.primary }]}>
                <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 13 * baseScale }}>{transitNotice}</Text>
              </View>
            ) : (
              transitIts.map((it, i) => {
                const active = i === selectedIt;
                const transitLegs = it.legs.filter((l) => l.mode !== 'WALK');
                const accessColor = it.access === 'yes' ? palette.ok : it.access === 'no' ? palette.bad : palette.muted;
                const accessLabel = it.access === 'yes' ? 'доступний' : it.access === 'no' ? 'недоступний транспорт' : 'невідомо';
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${it.durationMin} хвилин, ${accessLabel}`}
                    onPress={() => setSelectedIt(i)}
                    style={[
                      styles.itCard,
                      {
                        borderColor: active ? palette.primary : 'transparent',
                        backgroundColor: active ? palette.primaryTint : palette.surface,
                        borderBottomWidth: active ? 2 : 1,
                        borderBottomColor: active ? palette.primary : palette.border,
                      },
                    ]}
                  >
                    <View style={styles.itHeaderRow}>
                      <Text style={{ color: palette.text, fontWeight: '800', fontSize: 15 * baseScale }}>{it.durationMin} хв</Text>
                      <Text style={{ color: palette.muted, fontSize: 12 * baseScale }}>
                        {fmtTime(it.startTime)}–{fmtTime(it.endTime)} · {it.transfers === 0 ? 'без пересадок' : `${it.transfers} перес.`}
                      </Text>
                      <Text style={{ marginLeft: 'auto', color: accessColor, fontWeight: '700', fontSize: 12 * baseScale }}>
                        {accessLabel}
                      </Text>
                    </View>
                    {transitLegs.length > 0 ? (
                      <View style={styles.chipRow}>
                        {transitLegs.map((l, j) => {
                          const chipColor = l.accessible === 'yes' ? palette.ok : l.accessible === 'no' ? palette.bad : palette.muted;
                          return (
                            <View key={j} style={[styles.chip, { backgroundColor: `${chipColor}21` }]}>
                              <Text
                                style={{
                                  color: l.accessible === 'unknown' ? palette.text : chipColor,
                                  fontWeight: '700',
                                  fontSize: 11 * baseScale,
                                }}
                              >
                                {legLabel(l)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    {active ? (
                      <View style={styles.legTimeline}>
                        {it.legs.map((l, j) => (
                          <View key={j} style={styles.legRow}>
                            <Text style={{ color: palette.muted, fontSize: 12 * baseScale }}>{fmtTime(l.startTime)}</Text>
                            <Text style={{ flex: 1, color: palette.text, fontSize: 13 * baseScale }}>
                              {l.mode === 'WALK' ? 'Пішки' : `${legLabel(l)}: «${l.fromName}» → «${l.toName}»`}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
            {transitLegend ? (
              <Text style={{ color: palette.muted, fontSize: 11 * baseScale }}>
                Зелений — низькопідлогові автобуси й тролейбуси; червоний — маршрутки та старі трамваї.
              </Text>
            ) : null}
          </View>
        ) : null}

        {planStatus === 'ready' && travelMode === 'walk' ? (
          <>
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
                  <View key={i} style={[styles.step, i ? { borderTopWidth: 1, borderTopColor: palette.border } : null]}>
                    <View style={[styles.num, { backgroundColor: palette.primaryTint }]}>
                      <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 12 * baseScale }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, color: palette.text, fontSize: 14 * baseScale }}>{s.instruction}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12 * baseScale }}>{distanceLabel(s.distance)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
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
  markerWrap: { alignItems: 'center', width: 140 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  markerLabel: { marginTop: 2, maxWidth: 140, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  markerLabelText: { fontSize: 11, fontWeight: '700' },
  steps: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itCard: { borderWidth: 2, borderRadius: radii.md, padding: space.md, gap: space.xs },
  itHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { borderRadius: radii.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
  legTimeline: { marginTop: space.xs, gap: 2 },
  legRow: { flexDirection: 'row', gap: space.sm, paddingVertical: 2 },
});
