import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { Category, Rating } from '@safecity/shared';
import { basemapStyle } from '@/lib/mapStyle';
import { useTheme, type Palette } from '@/theme/theme';

const LVIV: [number, number] = [24.0316, 49.8419];

export interface MapMarkerData {
  id: string;
  lng: number;
  lat: number;
  category: Category;
  rating: Rating;
}

const ratingColorKey: Record<Rating, 'ok' | 'warn' | 'bad' | 'unk'> = {
  full: 'ok',
  partial: 'warn',
  none: 'bad',
  unknown: 'unk',
};
const ratingIcon: Record<Rating, string> = { full: '✓', partial: '◑', none: '✕', unknown: '?' };

// Category → marker shape. Rating gives colour+icon; category gives shape (web parity).
function shapeStyle(category: Category) {
  switch (category) {
    case 'transit':
      return { borderRadius: 6 };
    case 'crossing':
      return { borderRadius: 4, transform: [{ rotate: '45deg' }] };
    default:
      return { borderRadius: 14 };
  }
}

/** MapLibre map (CARTO basemap) with a rating-coloured, category-shaped pin per point. */
export function PointsMap({
  markers,
  onSelect,
}: {
  markers: MapMarkerData[];
  onSelect?: (id: string) => void;
}) {
  const { palette, themeName } = useTheme();
  const mapStyle = useMemo(() => basemapStyle(themeName === 'dark'), [themeName]);

  return (
    <Map style={styles.map} mapStyle={mapStyle}>
      <Camera initialViewState={{ center: LVIV, zoom: 13 }} />
      {markers.map((m) => {
        const color = palette[ratingColorKey[m.rating] as keyof Palette];
        const diamond = m.category === 'crossing';
        return (
          <Marker key={m.id} id={m.id} lngLat={[m.lng, m.lat]} onPress={() => onSelect?.(m.id)}>
            <View
              style={[
                styles.pin,
                shapeStyle(m.category),
                { backgroundColor: color, borderColor: palette.surface },
              ]}
            >
              <Text style={[styles.icon, diamond && { transform: [{ rotate: '-45deg' }] }]}>
                {ratingIcon[m.rating]}
              </Text>
            </View>
          </Marker>
        );
      })}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pin: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  icon: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
