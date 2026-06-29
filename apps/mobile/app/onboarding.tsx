import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Profile } from '@safecity/shared';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

const NEEDS: { p: Profile; title: string; sub: string }[] = [
  { p: 'wheelchair', title: 'Візок або знижена мобільність', sub: 'Пандуси, ліфти, вхід без сходів, доступні туалети' },
  { p: 'blind', title: 'Незрячість або порушення зору', sub: 'Озвучення, тактильна плитка, аудіо-опис поряд' },
];

const PROFILE_TITLE: Record<Profile, string> = {
  wheelchair: 'Візок / мобільність',
  blind: 'Зір',
};

export default function Onboarding() {
  const router = useRouter();
  const { palette, baseScale } = useTheme();
  const { completeOnboarding } = useProfile();
  const [step, setStep] = useState<'welcome' | 'needs' | 'primary'>('welcome');
  const [selected, setSelected] = useState<Profile[]>([]);

  function toggle(p: Profile) {
    setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function finish(primary: Profile) {
    completeOnboarding(selected, primary);
    router.replace('/places');
  }

  function next() {
    if (step === 'welcome') return setStep('needs');
    if (step === 'needs') {
      if (selected.length === 1) return finish(selected[0]!);
      return setStep('primary');
    }
  }

  const canAdvance = step !== 'needs' || selected.length > 0;

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
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>
              Що для вас важливо?
            </Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>
              Можна обрати кілька.
            </Text>
            {NEEDS.map((n) => {
              const on = selected.includes(n.p);
              return (
                <Pressable
                  key={n.p}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={n.title}
                  onPress={() => toggle(n.p)}
                  style={[
                    styles.card,
                    { backgroundColor: on ? palette.primaryTint : palette.surface, borderColor: on ? palette.primary : palette.border },
                  ]}
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
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>
              Що показувати першим?
            </Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>
              Оцінки доступності рахуються під цю потребу.
            </Text>
            {selected.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={PROFILE_TITLE[p]}
                onPress={() => finish(p)}
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.cardTitle, { color: palette.text, fontSize: 17 * baseScale }]}>
                  {PROFILE_TITLE[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {step !== 'primary' && (
        <Pressable
          accessibilityRole="button"
          disabled={!canAdvance}
          onPress={next}
          style={[styles.cta, { backgroundColor: palette.primary, opacity: canAdvance ? 1 : 0.5 }]}
        >
          <Text style={[styles.ctaText, { color: palette.onPrimary, fontSize: 17 * baseScale }]}>
            {step === 'welcome' ? 'Почати' : 'Далі'}
          </Text>
        </Pressable>
      )}
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
  card: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg, gap: space.xs },
  cardTitle: { fontWeight: '700' },
  cardSub: {},
  cta: {
    margin: space.lg,
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontWeight: '800' },
});
