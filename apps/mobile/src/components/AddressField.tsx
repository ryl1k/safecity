// Editable address field with abort-based autocomplete — RN port of the web
// PointDetailModal's inline AddressField (apps/web/src/components/PointDetailModal.tsx).
// Results render as a plain in-flow list under the field (no portals/absolute
// positioning — this lives inside a ScrollView).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';
import { radii, space, useTheme } from '@/theme/theme';

interface Props {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (coords: [number, number], label: string) => void;
  /** Whether this field is the one the user is currently interacting with —
   *  gates both the search effect and the results list, so a programmatic
   *  pre-fill (e.g. destination loaded from a point, or the geolocation seed)
   *  never triggers a search. */
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  accessibilityLabel: string;
}

export function AddressField({
  placeholder,
  value,
  onChangeText,
  onSelect,
  active,
  onActivate,
  onDeactivate,
  accessibilityLabel,
}: Props) {
  const { palette, baseScale } = useTheme();
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only search while the field is active (focused/edited by the user) — not
  // on programmatic value changes (destination pre-fill, geolocation seed).
  // Debounced ~300 ms so we don't fire a geocode request per keystroke (the
  // Nominatim fallback has a strict 1 req/s policy).
  useEffect(() => {
    if (!active || value.trim().length < 3) {
      setResults([]);
      return;
    }
    let ctrl: AbortController | null = null;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      geocodePlaces(value, 5, ctrl.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl?.abort();
    };
  }, [value, active]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  function handleSelect(r: GeoPlace) {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setResults([]);
    onSelect([r.lng, r.lat], r.label);
  }

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.field,
          { borderColor: active ? palette.primary : palette.borderStrong, backgroundColor: palette.surface },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChangeText(v);
            onActivate();
          }}
          onFocus={onActivate}
          // Delay so a tap on a result row (which blurs the input first) still registers.
          onBlur={() => {
            blurTimer.current = setTimeout(onDeactivate, 150);
          }}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          accessibilityLabel={accessibilityLabel}
          style={[styles.input, { color: palette.text, fontSize: 15 * baseScale }]}
        />
        {searching ? <ActivityIndicator size="small" color={palette.muted} /> : null}
      </View>
      {active && results.length > 0 ? (
        <View style={[styles.dropdown, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}>
          {results.map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              onPress={() => handleSelect(r)}
              style={({ pressed }) => [
                styles.row,
                i ? { borderTopWidth: 1, borderTopColor: palette.border } : null,
                pressed ? { backgroundColor: palette.surface2 } : null,
              ]}
            >
              <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14 * baseScale }}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    borderWidth: 2,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
  },
  input: { flex: 1, paddingVertical: space.sm },
  dropdown: { borderWidth: 1, borderRadius: radii.md, overflow: 'hidden' },
  row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.sm },
});
