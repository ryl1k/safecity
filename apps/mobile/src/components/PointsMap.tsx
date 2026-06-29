import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';
import type { PointSummary } from '@safecity/shared';
import { MAP_TILE_URL } from '@/lib/env';
import { useTheme } from '@/theme/theme';

const LVIV: [number, number] = [24.0316, 49.8419];

/** MapLibre map with OSM raster tiles + a pin per point. */
export function PointsMap({
  points,
  onSelect,
}: {
  points: PointSummary[];
  onSelect?: (id: string) => void;
}) {
  const { palette } = useTheme();
  const mapStyle = useMemo(
    () =>
      JSON.stringify({
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [MAP_TILE_URL],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      }),
    [],
  );

  return (
    <MapView style={styles.map} mapStyle={mapStyle}>
      <Camera defaultSettings={{ centerCoordinate: LVIV, zoomLevel: 13 }} />
      {points.map((p) => (
        <PointAnnotation
          key={p.id}
          id={p.id}
          coordinate={[p.lng, p.lat]}
          onSelected={() => onSelect?.(p.id)}
        >
          <View
            style={[styles.pin, { backgroundColor: palette.primary, borderColor: palette.onPrimary }]}
          />
        </PointAnnotation>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
