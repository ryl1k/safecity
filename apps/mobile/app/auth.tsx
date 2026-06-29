import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme/theme';

export default function AuthScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { palette, baseScale } = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function done() {
    if (next) router.replace(next as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/places');
  }

  async function submit() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'up') {
        const { error: e } = await supabase.auth.signUp({ email: email.trim(), password });
        if (e) throw e;
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setInfo('Перевірте пошту для підтвердження акаунта.');
          return;
        }
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
      }
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.h1, { color: palette.text, fontSize: 26 * baseScale }]}>
          {mode === 'in' ? 'Увійти' : 'Створити акаунт'}
        </Text>
        <Text style={[styles.lead, { color: palette.muted, fontSize: 15 * baseScale }]}>
          Акаунт потрібен лише, щоб додавати місця, відгуки та підтримувати петиції.
        </Text>

        <Field label="Пошта" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" placeholder="you@example.com" />
        <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="••••••••" />

        {error ? <Text accessibilityRole="alert" style={{ color: palette.bad }}>{error}</Text> : null}
        {info ? <Text accessibilityRole="alert" style={{ color: palette.ok }}>{info}</Text> : null}

        <Button title={mode === 'in' ? 'Увійти' : 'Зареєструватися'} onPress={submit} loading={busy} />

        <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={styles.toggle}>
          <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 14 * baseScale }}>
            {mode === 'in' ? 'Немає акаунта? Зареєструватися' : 'Вже маєте акаунт? Увійти'}
          </Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.replace('/places')} style={styles.toggle}>
          <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>Продовжити як гість</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center' },
  h1: { fontWeight: '800' },
  lead: { lineHeight: 22, marginBottom: space.md },
  toggle: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
