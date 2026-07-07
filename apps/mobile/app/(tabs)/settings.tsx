import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { radii, space, useTheme, type ThemeName } from '@/theme/theme';

const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'standard', label: 'Стандартна' },
  { name: 'contrast', label: 'Контрастна' },
  { name: 'dark', label: 'Темна' },
];

export default function SettingsScreen() {
  const { palette, baseScale, themeName, setTheme } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={styles.content}>
      <Section title="Тема" palette={palette} scale={baseScale}>
        <View style={styles.rowWrap}>
          {THEMES.map((t) => (
            <Choice
              key={t.name}
              label={t.label}
              active={themeName === t.name}
              palette={palette}
              onPress={() => setTheme(t.name)}
            />
          ))}
        </View>
      </Section>

      <Section title="Налаштування потреб" palette={palette} scale={baseScale}>
        <Button title="Пройти онбординг знову" variant="secondary" onPress={() => router.push('/onboarding')} />
      </Section>

      <Section title="Акаунт" palette={palette} scale={baseScale}>
        {email ? (
          <>
            <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>Ви увійшли як {email}</Text>
            <Button title="Вийти" variant="danger" onPress={() => void supabase.auth.signOut()} />
          </>
        ) : (
          <>
            <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>
              Акаунт потрібен лише, щоб додавати місця, відгуки та підтримувати петиції.
            </Text>
            <Button title="Увійти" onPress={() => router.push('/auth?next=/settings')} />
          </>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  palette,
  scale,
  children,
}: {
  title: string;
  palette: ReturnType<typeof useTheme>['palette'];
  scale: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={{ color: palette.muted, fontSize: 13 * scale, fontWeight: '700', textTransform: 'uppercase' }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  active,
  palette,
  onPress,
}: {
  label: string;
  active: boolean;
  palette: ReturnType<typeof useTheme>['palette'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: active ? palette.primary : palette.surface,
          borderColor: active ? palette.primary : palette.border,
        },
      ]}
    >
      <Text style={{ color: active ? palette.onPrimary : palette.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, flexGrow: 1 },
  section: { gap: space.md },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radii.md,
  },
});
