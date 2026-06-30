import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { radii, space, useTheme } from '@/theme/theme';

/** Pick + preview up to `max` photos. Keeps local URIs; the parent uploads on submit. */
export function PhotoInput({
  uris,
  onChange,
  max = 4,
}: {
  uris: string[];
  onChange: (uris: string[]) => void;
  max?: number;
}) {
  const { palette, baseScale } = useTheme();

  async function add() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const remaining = max - uris.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return;
    const picked = result.assets.map((a) => a.uri);
    onChange([...uris, ...picked].slice(0, max));
  }

  function remove(i: number) {
    onChange(uris.filter((_, idx) => idx !== i));
  }

  return (
    <View style={styles.row}>
      {uris.map((uri, i) => (
        <View key={uri} style={styles.thumbWrap}>
          <Image source={{ uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Прибрати фото ${i + 1}`}
            onPress={() => remove(i)}
            hitSlop={8}
            style={[styles.remove, { backgroundColor: palette.bad }]}
          >
            <Text style={styles.removeX}>✕</Text>
          </Pressable>
        </View>
      ))}
      {uris.length < max ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Додати фото"
          onPress={add}
          style={[styles.addBox, { borderColor: palette.borderStrong, backgroundColor: palette.surface }]}
        >
          <Text style={{ color: palette.muted, fontSize: 28 * baseScale }}>＋</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: 76, height: 76, borderRadius: radii.md, backgroundColor: '#0001' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeX: { color: '#fff', fontSize: 12, fontWeight: '800' },
  addBox: {
    width: 76,
    height: 76,
    borderRadius: radii.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
