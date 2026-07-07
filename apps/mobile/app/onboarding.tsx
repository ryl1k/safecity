import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentLocation } from '@/lib/location';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

// SafeCity is wheelchair/mobility-only — lean 2-step flow (welcome + geolocation),
// no profile choice, no font-size step. Everyone defaults to the wheelchair profile.
type Step = 'welcome' | 'location';

export default function Onboarding() {
  const router = useRouter();
  const { palette, baseScale } = useTheme();
  const { completeOnboarding } = useProfile();
  const [step, setStep] = useState<Step>('welcome');
  const [requesting, setRequesting] = useState(false);

  function finish() {
    completeOnboarding(['wheelchair'], 'wheelchair');
    router.replace('/places');
  }

  async function allowAndFinish() {
    setRequesting(true);
    try {
      await getCurrentLocation();
    } finally {
      finish();
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <View style={styles.body}>
        {step === 'welcome' && (
          <View style={styles.center}>
            <Text style={[styles.h1, { color: palette.text, fontSize: 30 * baseScale }]}>SafeCity</Text>
            <Text style={[styles.lead, { color: palette.muted, fontSize: 17 * baseScale }]}>
              Мапа доступних місць для людей на кріслі колісному та з обмеженою мобільністю. Знаходьте місця
              без бар’єрів і будуйте зручні маршрути.
            </Text>
          </View>
        )}

        {step === 'location' && (
          <View style={styles.stack}>
            <Text style={[styles.h2, { color: palette.text, fontSize: 22 * baseScale }]}>
              Доступ до місцезнаходження
            </Text>
            <Text style={[styles.hint, { color: palette.muted, fontSize: 15 * baseScale }]}>
              Щоб показувати доступні місця поруч і будувати маршрути, дозвольте доступ до геолокації. Можна
              зробити це пізніше.
            </Text>
          </View>
        )}
      </View>

      {step === 'welcome' ? (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('location')}
            style={[styles.cta, { backgroundColor: palette.primary }]}
          >
            <Text style={[styles.ctaText, { color: palette.onPrimary, fontSize: 17 * baseScale }]}>Почати</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.footer, styles.footerStack]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: requesting, busy: requesting }}
            disabled={requesting}
            onPress={allowAndFinish}
            style={[styles.cta, { backgroundColor: palette.primary, opacity: requesting ? 0.6 : 1 }]}
          >
            <Text style={[styles.ctaText, { color: palette.onPrimary, fontSize: 17 * baseScale }]}>
              {requesting ? 'Зачекайте…' : 'Дозволити й завершити'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={requesting} onPress={finish} style={styles.ctaGhost}>
            <Text style={[styles.ctaGhostText, { color: palette.primary, fontSize: 15 * baseScale }]}>
              Пізніше
            </Text>
          </Pressable>
        </View>
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
  footer: { margin: space.lg },
  footerStack: { gap: space.sm },
  cta: { minHeight: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontWeight: '800' },
  ctaGhost: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ctaGhostText: { fontWeight: '700' },
});
