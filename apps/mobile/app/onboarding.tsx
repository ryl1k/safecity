import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Profile } from '@safecity/shared';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme, type ThemeName } from '@/theme/theme';

const NEEDS: { p: Profile; title: string; sub: string }[] = [
  { p: 'wheelchair', title: 'Візок або знижена мобільність', sub: 'Пандуси, ліфти, вхід без сходів, доступні туалети' },
  { p: 'blind', title: 'Незрячість або порушення зору', sub: 'Озвучення, тактильна плитка, аудіо-опис поряд' },
];
const PROFILE_TITLE: Record<Profile, string> = { wheelchair: 'Візок / мобільність', blind: 'Зір' };
const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'standard', label: 'Стандартна' },
  { name: 'contrast', label: 'Контрастна' },
  { name: 'dark', label: 'Темна' },
];

type Step = 'welcome' | 'needs' | 'primary' | 'text';

export default function Onboarding() {
  const router = useRouter();
  const { palette, baseScale, fontScale, setFontScale, themeName, setTheme } = useTheme();
  const { completeOnboarding } = useProfile();
  const [step, setStep] = useState<Step>('welcome');
  const [selected, setSelected] = useState<Profile[]>([]);
  const [chosenPrimary, setChosenPrimary] = useState<Profile | null>(null);

  function toggle(p: Profile) {
    setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function finish() {
    completeOnboarding(selected, chosenPrimary ?? selected[0] ?? 'wheelchair');
    router.replace('/places');
  }

  function next() {
    if (step === 'welcome') return setStep('needs');
    if (step === 'needs') {
      if (selected.length === 0) return;
      if (selected.length === 1) {
        setChosenPrimary(selected[0]!);
        return setStep('text');
      }
      return setStep('primary');
    }
    if (step === 'text') return finish();
  }

  const canAdvance = step !== 'needs' || selected.length > 0;
  const ctaLabel = step === 'welcome' ? 'Почати' : step === 'text' ? 'Готово' : 'Далі';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <View style={styles.body}>
        {step === 'welcome' && (
          <View style={styles.center}>
            <Text style={[styles.h1, { color: palette.text, fontSize: 30 * baseScale }]}>SafeCity</Text>
            <Text style={[styles.lead, { color: palette.muted, fontSize: 17 * baseScale }]}>
              Інклюзивна мапа Львова. Налаштуємо застосунок під ваші потреби.
            </Text>
          </View>
        )}

        {step === 'needs' && (
          <View style={styles.stack}>
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>Що для вас важливо?</Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>Можна обрати кілька.</Text>
            {NEEDS.map((n) => {
              const on = selected.includes(n.p);
              return (
                <Pressable
                  key={n.p}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={n.title}
                  onPress={() => toggle(n.p)}
                  style={[styles.card, { backgroundColor: on ? palette.primaryTint : palette.surface, borderColor: on ? palette.primary : palette.border }]}
                >
                  <Text style={[styles.cardTitle, { color: palette.text, fontSize: 17 * baseScale }]}>
                    {on ? '☑ ' : '☐ '}
                    {n.title}
                  </Text>
                  <Text style={[styles.cardSub, { color: palette.muted, fontSize: 14 * baseScale }]}>{n.sub}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {step === 'primary' && (
          <View style={styles.stack}>
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>Що показувати першим?</Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>Оцінки доступності рахуються під цю потребу.</Text>
            {selected.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={PROFILE_TITLE[p]}
                onPress={() => {
                  setChosenPrimary(p);
                  setStep('text');
                }}
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.cardTitle, { color: palette.text, fontSize: 17 * baseScale }]}>{PROFILE_TITLE[p]}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 'text' && (
          <View style={styles.stack}>
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>Зручність читання</Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>
              Налаштуйте розмір тексту й тему. Це можна змінити будь-коли в Профілі.
            </Text>

            <Text style={[styles.label, { color: palette.muted, fontSize: 13 * baseScale }]}>РОЗМІР ТЕКСТУ</Text>
            <View style={styles.sizeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Зменшити текст"
                onPress={() => setFontScale(fontScale - 0.1)}
                style={[styles.sizeBtn, { borderColor: palette.border, backgroundColor: palette.surface }]}
              >
                <Text style={{ color: palette.text, fontWeight: '800', fontSize: 18 }}>А−</Text>
              </Pressable>
              <Text style={{ color: palette.text, fontWeight: '800', fontSize: 16 * baseScale }}>
                {Math.round(fontScale * 100)}%
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Збільшити текст"
                onPress={() => setFontScale(fontScale + 0.1)}
                style={[styles.sizeBtn, { borderColor: palette.border, backgroundColor: palette.surface }]}
              >
                <Text style={{ color: palette.text, fontWeight: '800', fontSize: 22 }}>А+</Text>
              </Pressable>
            </View>
            <Text style={[styles.preview, { color: palette.text, fontSize: 16 * baseScale, borderColor: palette.border }]}>
              Зразок тексту такого розміру.
            </Text>

            <Text style={[styles.label, { color: palette.muted, fontSize: 13 * baseScale }]}>ТЕМА</Text>
            <View style={styles.themeRow}>
              {THEMES.map((t) => {
                const on = themeName === t.name;
                return (
                  <Pressable
                    key={t.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setTheme(t.name)}
                    style={[styles.themeChip, { backgroundColor: on ? palette.primary : palette.surface, borderColor: on ? palette.primary : palette.border }]}
                  >
                    <Text style={{ color: on ? palette.onPrimary : palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!canAdvance}
        onPress={next}
        style={[styles.cta, { backgroundColor: palette.primary, opacity: canAdvance ? 1 : 0.5 }]}
      >
        <Text style={[styles.ctaText, { color: palette.onPrimary, fontSize: 17 * baseScale }]}>{ctaLabel}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: space.xl, justifyContent: 'center' },
  center: { gap: space.md, alignItems: 'center' },
  stack: { gap: space.md },
  h1: { fontWeight: '800', textAlign: 'center' },
  h2: { fontWeight: '800' },
  lead: { textAlign: 'center', lineHeight: 24 },
  hint: {},
  label: { fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg, gap: space.xs },
  cardTitle: { fontWeight: '700' },
  cardSub: {},
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  sizeBtn: { minWidth: 64, minHeight: 48, borderWidth: 1, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  preview: { borderWidth: 1, borderRadius: radii.md, padding: space.md, lineHeight: 24 },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  themeChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1, borderRadius: radii.md },
  cta: { margin: space.lg, minHeight: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontWeight: '800' },
});
