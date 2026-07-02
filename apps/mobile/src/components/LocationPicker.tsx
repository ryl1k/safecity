import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { basemapStyle } from '@/lib/mapStyle';
import { useCity } from '@/state/CityProvider';
import { radii, space, useTheme } from '@/theme/theme';

/** Tap the map to drop / move the marker. Mirrors web LocationPicker.
 *  Defaults to the selected city's centre (not a hardcoded location) until
 *  the user drops a pin. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (lng: number, lat: number) => void;
}) {
  const { palette, baseScale, themeName } = useTheme();
  const { city } = useCity();
  const center: [number, number] = value ?? [city.lng, city.lat];
  const mapStyle = useMemo(() => basemapStyle(themeName === 'dark'), [themeName]);

  return (
    <View>
      <View style={[styles.box, { borderColor: palette.borderStrong }]}>
        <Map
          style={styles.map}
          mapStyle={mapStyle}
          onPress={(e) => {
            const c = e.nativeEvent.lngLat;
            if (Array.isArray(c) && c.length === 2) onChange(c[0], c[1]);
          }}
        >
          <Camera initialViewState={{ center, zoom: 14 }} />
          {value ? (
            <Marker id="picked" lngLat={value}>
              <View style={[styles.pin, { backgroundColor: palette.accent, borderColor: palette.onPrimary }]} />
            </Marker>
          ) : null}
        </Map>
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
