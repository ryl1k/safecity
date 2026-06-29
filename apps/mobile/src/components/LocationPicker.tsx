import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';
import { MAP_TILE_URL } from '@/lib/env';
import { radii, space, useTheme } from '@/theme/theme';

const LVIV: [number, number] = [24.0316, 49.8419];

/** Tap the map to drop / move the marker. Mirrors web LocationPicker. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (lng: number, lat: number) => void;
}) {
  const { palette, baseScale } = useTheme();
  const center = value ?? LVIV;
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

  return (
    <View>
      <View style={[styles.box, { borderColor: palette.borderStrong }]}>
        <MapView
          style={styles.map}
          mapStyle={mapStyle}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={(e: any) => {
            const c = e?.geometry?.coordinates;
            if (Array.isArray(c) && c.length === 2) onChange(c[0], c[1]);
          }}
        >
          <Camera defaultSettings={{ centerCoordinate: center, zoomLevel: 14 }} />
          {value ? (
            <PointAnnotation id="picked" coordinate={value}>
              <View style={[styles.pin, { backgroundColor: palette.accent, borderColor: palette.onPrimary }]} />
            </PointAnnotation>
          ) : null}
        </MapView>
      </View>
      <Text style={{ color: palette.muted, fontSize: 13 * baseScale, marginTop: space.xs }}>
        {value
          ? `Обрано: ${value[1].toFixed(5)}, ${value[0].toFixed(5)}`
          : 'Торкніться мапи, щоб позначити місце.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 220, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  map: { flex: 1 },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
});
