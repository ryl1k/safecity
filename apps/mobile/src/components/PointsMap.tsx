import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Category } from '@safecity/shared';
import { categoryIcon } from '@/lib/filters';
import { basemapStyle } from '@/lib/mapStyle';
import { useTheme } from '@/theme/theme';

const LABEL_ZOOM = 15.5; // show name labels once zoomed in this far
type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface MapMarkerData {
  id: string;
  lng: number;
  lat: number;
  category: Category;
  name: string;
  accessible: boolean; // mobility-accessible (full/partial) for the active profile
}

/** MapLibre map (CARTO basemap) with category-icon pins, an accessibility ring,
 *  and name labels that appear once zoomed in. `center` is required — callers
 *  drive it from the selected city (or the user's location). Memoized: callers
 *  must pass stable `center`/`onSelect` references or the memo is defeated. */
function PointsMapInner({
  markers,
  onSelect,
  center,
  zoom = 13,
  me,
}: {
  markers: MapMarkerData[];
  onSelect?: (id: string) => void;
  center: [number, number];
  zoom?: number;
  me?: [number, number] | null;
}) {
  const { palette, themeName } = useTheme();
  const mapStyle = useMemo(() => basemapStyle(themeName === 'dark'), [themeName]);
  const [mapZoom, setMapZoom] = useState(zoom);
  const showLabels = mapZoom >= LABEL_ZOOM;

  return (
    <Map
      style={styles.map}
      mapStyle={mapStyle}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onRegionDidChange={(e: any) => {
        const z = e?.properties?.zoom ?? e?.nativeEvent?.zoom;
        if (typeof z === 'number' && Math.abs(z - mapZoom) > 0.25) setMapZoom(z);
      }}
    >
      {/* MapLibre RN v11 Camera doesn't re-fly on prop changes alone — remount
          it (keyed on the target) so switching cities recenters the map. */}
      <Camera key={`${center[0]},${center[1]}`} initialViewState={{ center, zoom }} />
      {me ? (
        <Marker id="me" lngLat={me}>
          <View style={[styles.me, { borderColor: palette.surface, backgroundColor: palette.focus }]} />
        </Marker>
      ) : null}
      {markers.map((m) => (
        <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]} onPress={() => onSelect?.(m.id)}>
          <View style={styles.pinWrap}>
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: palette.surface,
                  borderColor: m.accessible ? palette.ok : palette.borderStrong,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={categoryIcon[m.category] as MciName}
                size={18}
                color={m.accessible ? palette.ok : palette.muted}
              />
            </View>
            {showLabels ? (
              <View style={[styles.label, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text numberOfLines={1} style={[styles.labelText, { color: palette.text }]}>
                  {m.name}
                </Text>
              </View>
            ) : null}
          </View>
        </Marker>
      ))}
    </Map>
  );
}

export const PointsMap = memo(PointsMapInner);

const styles = StyleSheet.create({
  map: { flex: 1 },
  pinWrap: { alignItems: 'center', width: 120 },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  label: {
    marginTop: 2,
    maxWidth: 120,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  labelText: { fontSize: 11, fontWeight: '700' },
  me: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
});
