import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoInput } from '@/components/PhotoInput';
import { Button, Field, LoadingState, Segmented } from '@/components/ui';
import { reportProblem } from '@/lib/civic';
import { successFeedback } from '@/lib/haptics';
import { pointById } from '@/lib/points';
import { uploadPhotos } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme/theme';

const SEVERITY: { value: '1' | '2' | '3'; label: string }[] = [
  { value: '1', label: 'Незначна' },
  { value: '2', label: 'Середня' },
  { value: '3', label: 'Серйозна' },
];

export default function NewProblem() {
  const { point } = useLocalSearchParams<{ point?: string }>();
  const router = useRouter();
  const { palette, baseScale } = useTheme();

  const [gate, setGate] = useState<'checking' | 'guest' | 'ready'>('checking');
  const [pointName, setPointName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'1' | '2' | '3'>('2');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        setGate('guest');
        return;
      }
      if (point) {
        const p = await pointById(point);
        if (alive) setPointName(p?.name ?? null);
      }
      if (alive) setGate('ready');
    })();
    return () => {
      alive = false;
    };
  }, [point]);

  async function submit() {
    setError(null);
    if (!point) {
      setError('Немає прив’язаного місця.');
      return;
    }
    if (!title.trim()) {
      setError('Вкажіть заголовок.');
      return;
    }
    setBusy(true);
    try {
      const photoUrls = await uploadPhotos(photos, 'problems');
      const newId = await reportProblem({
        pointId: point,
        title: title.trim(),
        description: description.trim(),
        severity: Number(severity),
        photos: photoUrls,
      });
      successFeedback();
      router.replace(`/problem/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося надіслати');
    } finally {
      setBusy(false);
    }
  }

  const Header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: palette.surface }}>
      <View style={[styles.bar, { borderBottomColor: palette.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: palette.primary, fontSize: 17 * baseScale, fontWeight: '700' }}>‹ Назад</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  if (gate === 'checking') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <LoadingState />
      </View>
    );
  }
  if (gate === 'guest') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <View style={styles.gate}>
          <Text style={{ color: palette.text, fontSize: 18 * baseScale, fontWeight: '800', textAlign: 'center' }}>
            Увійдіть, щоб повідомити про проблему
          </Text>
          <Button
            title="Увійти"
            onPress={() => router.replace(`/auth?next=/problem/new${point ? `?point=${point}` : ''}`)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { color: palette.text, fontSize: 23 * baseScale }]}>Повідомити про проблему</Text>
        {pointName ? (
          <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>Місце: {pointName}</Text>
        ) : null}

        <Field label="Заголовок" value={title} onChangeText={setTitle} placeholder="напр. Зламаний пандус біля входу" />
        <Field
          label="Опис"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="Опишіть бар’єр детальніше"
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />

        <View style={{ gap: space.sm }}>
          <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>Серйозність</Text>
          <Segmented value={severity} onChange={setSeverity} options={SEVERITY} />
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>Фото (необов’язково)</Text>
          <PhotoInput uris={photos} onChange={setPhotos} />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: palette.bad, fontWeight: '700', fontSize: 14 * baseScale }}>
            {error}
          </Text>
        ) : null}
        <Button title={busy ? 'Надсилання…' : 'Надіслати'} onPress={submit} loading={busy} disabled={!title.trim()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.sm },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  gate: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md, padding: space.xl },
  h1: { fontWeight: '800' },
});
