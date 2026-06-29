import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Profile } from '@safecity/shared';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme, type ThemeName } from '@/theme/theme';

const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'standard', label: 'Стандартна' },
  { name: 'contrast', label: 'Контрастна' },
  { name: 'dark', label: 'Темна' },
];

const PROFILE_LABEL: Record<Profile, string> = {
  wheelchair: 'Візок / мобільність',
  blind: 'Зір',
};

export default function SettingsScreen() {
  const { palette, baseScale, themeName, setTheme, fontScale, setFontScale } = useTheme();
  const { needs, primary, setPrimary } = useProfile();

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

      <Section title="Розмір тексту" palette={palette} scale={baseScale}>
        <View style={styles.scaleRow}>
          <Choice label="А−" palette={palette} active={false} onPress={() => setFontScale(fontScale - 0.1)} />
          <Text style={{ color: palette.text, fontWeight: '700' }}>{Math.round(fontScale * 100)}%</Text>
          <Choice label="А+" palette={palette} active={false} onPress={() => setFontScale(fontScale + 0.1)} />
        </View>
      </Section>

      {needs.length > 1 ? (
        <Section title="Основна потреба" palette={palette} scale={baseScale}>
          <View style={styles.rowWrap}>
            {needs.map((p) => (
              <Choice
                key={p}
                label={PROFILE_LABEL[p]}
                active={primary === p}
                palette={palette}
                onPress={() => setPrimary(p)}
              />
            ))}
          </View>
        </Section>
      ) : null}
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
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radii.md,
  },
});
