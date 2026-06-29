import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { AccessibilityFeature, Category, FeatureValue } from '@safecity/shared';
import { LocationPicker } from '@/components/LocationPicker';
import { Button, Card, Chip, Field, LoadingState, Segmented } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { categoryLabel } from '@/lib/format';
import { LVIV } from '@/lib/location';
import { addPoint } from '@/lib/points';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme/theme';

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];
const VAL_OPTS: { value: FeatureValue; label: string }[] = [
  { value: 'yes', label: 'Так' },
  { value: 'no', label: 'Ні' },
  { value: 'unknown', label: '?' },
];

export default function ContributeScreen() {
  const { palette, baseScale } = useTheme();
  const router = useRouter();

  const [gate, setGate] = useState<'checking' | 'guest' | 'ready'>('checking');
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('venue');
  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [values, setValues] = useState<Record<string, FeatureValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        if (!data.session) {
          setGate('guest');
          return;
        }
        if (catalog.length === 0) setCatalog(await getCatalog());
        if (alive) setGate('ready');
      })();
      return () => {
        alive = false;
      };
    }, [catalog.length]),
  );

  const features = useMemo(
    () => catalog.filter((f) => f.categories.includes(category)),
    [catalog, category],
  );

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Вкажіть назву місця.');
      return;
    }
    setBusy(true);
    try {
      const p = loc ?? LVIV;
      const cleaned: Record<string, FeatureValue> = {};
      for (const [k, v] of Object.entries(values)) if (v === 'yes' || v === 'no') cleaned[k] = v;
      const newId = await addPoint({
        name: name.trim(),
        category,
        lng: p[0],
        lat: p[1],
        address: address.trim(),
        description: description.trim(),
        features: cleaned,
      });
      router.push(`/point/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося додати місце');
    } finally {
      setBusy(false);
    }
  }

  if (gate === 'checking') return <LoadingState />;

  if (gate === 'guest') {
    return (
      <View style={[styles.gate, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.text, fontSize: 18 * baseScale, fontWeight: '800', textAlign: 'center' }}>
          Увійдіть, щоб додавати місця
        </Text>
        <Text style={{ color: palette.muted, fontSize: 14 * baseScale, textAlign: 'center' }}>
          Акаунт потрібен лише, щоб додавати місця та відгуки.
        </Text>
        <Button title="Увійти" onPress={() => router.push('/auth?next=/contribute')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.h1, { color: palette.text, fontSize: 24 * baseScale }]}>Додати місце</Text>

      <Field label="Назва" value={name} onChangeText={setName} placeholder="напр. Кав’ярня «Кава»" />
      <Field label="Адреса" value={address} onChangeText={setAddress} placeholder="вул. Прикладна, 1" />
      <Field
        label="Опис"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        placeholder="Що це за місце та що варто знати про доступність?"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      <View style={{ gap: space.sm }}>
        <Text style={[styles.label, { color: palette.text, fontSize: 14 * baseScale }]}>Категорія</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={categoryLabel[c]} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[styles.label, { color: palette.text, fontSize: 14 * baseScale }]}>Місцезнаходження</Text>
        <LocationPicker value={loc} onChange={(lng, lat) => setLoc([lng, lat])} />
      </View>

      <Card>
        <Text style={[styles.label, { color: palette.text, fontSize: 15 * baseScale, marginBottom: space.sm }]}>
          Зручності доступності
        </Text>
        {features.map((f) => (
          <View key={f.key} style={styles.featRow}>
            <Text style={{ flex: 1, color: palette.text, fontSize: 14 * baseScale, fontWeight: '600' }}>
              {f.label}
              {f.critical ? <Text style={{ color: palette.accent }}> ★</Text> : null}
            </Text>
            <View style={{ width: 170 }}>
              <Segmented
                value={values[f.key] ?? 'unknown'}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                options={VAL_OPTS}
              />
            </View>
          </View>
        ))}
      </Card>

      <Text style={{ color: palette.muted, fontSize: 12 * baseScale }}>
        Додавання фото з’явиться в наступному оновленні.
      </Text>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.bad, fontWeight: '700', fontSize: 14 * baseScale }}>
          {error}
        </Text>
      ) : null}
      <Button title={busy ? 'Збереження…' : 'Додати місце'} onPress={submit} loading={busy} disabled={!name.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  gate: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md, padding: space.xl },
  h1: { fontWeight: '800' },
  label: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, flexWrap: 'wrap' },
});
