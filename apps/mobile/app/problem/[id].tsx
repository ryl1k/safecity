import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorState, Field, LoadingState, StatusPill } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { successFeedback } from '@/lib/haptics';
import {
  confirmProblem,
  createPetition,
  problemById,
  signPetition,
  type PetitionRow,
  type ProblemRow,
} from '@/lib/civic';
import { supabase } from '@/lib/supabase';
import { radii, space, useTheme } from '@/theme/theme';

const PETITION_GOAL = 250;
const ESCALATE_AT = 5;

export default function ProblemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette, baseScale } = useTheme();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [problem, setProblem] = useState<ProblemRow | null>(null);
  const [petition, setPetition] = useState<PetitionRow | null>(null);
  const [confirms, setConfirms] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [signed, setSigned] = useState(false);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const res = await problemById(id);
      if (!res) {
        setStatus('notfound');
        return;
      }
      setProblem(res.problem);
      setPetition(res.petition);
      setConfirms(res.problem.confirmations);
      setStatus('ready');
      // Reflect whether this user already confirmed / signed so we don't re-POST.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: conf } = await supabase
          .from('problem_confirmations')
          .select('problem_id')
          .eq('problem_id', id)
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (conf) setConfirmed(true);
        if (res.petition) {
          const { data: sig } = await supabase
            .from('petition_signatures')
            .select('petition_id')
            .eq('petition_id', res.petition.id)
            .eq('user_id', auth.user.id)
            .maybeSingle();
          if (sig) setSigned(true);
        }
      }
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function requireUser(): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push(`/auth?next=/problem/${id}`);
      return false;
    }
    return true;
  }

  async function onConfirm() {
    if (!(await requireUser())) return;
    setBusy(true);
    try {
      const res = await confirmProblem(id);
      setConfirms(res.confirmations);
      setConfirmed(true);
      successFeedback();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConfirmed(true); // already confirmed
      }
    } finally {
      setBusy(false);
    }
  }

  function openDraft() {
    if (!problem) return;
    setDraftTitle(`Усунути бар’єр: ${problem.title}`);
    setDraftBody(
      `${problem.description ? problem.description + '\n\n' : ''}` +
        `${problem.pointName ? `Локація: ${problem.pointName}.\n` : ''}` +
        `Цей бар’єр уже підтвердили ${confirms} мешканців. Просимо місто усунути його та зробити цю ділянку доступною.`,
    );
    setDraftOpen(true);
  }

  async function submitPetition() {
    if (!problem || !(await requireUser())) return;
    setCreating(true);
    try {
      const pet = await createPetition(
        problem.id,
        draftTitle.trim() || `Петиція: ${problem.title}`,
        draftBody.trim(),
      );
      setPetition(pet);
      setDraftOpen(false);
    } catch {
      /* leave the draft open to retry */
    } finally {
      setCreating(false);
    }
  }

  async function onSign() {
    if (!petition || !(await requireUser())) return;
    setBusy(true);
    try {
      await signPetition(petition.id);
      setSigned(true);
      successFeedback();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSigned(true);
    } finally {
      setBusy(false);
    }
  }

  const Header = (
    <SafeAreaView edges={['top']} style={{ backgroundColor: palette.surface }}>
      <View style={[styles.bar, { borderBottomColor: palette.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: palette.primary, fontSize: 17 * baseScale, fontWeight: '700' }}>‹ До громади</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <LoadingState label="Завантаження проблеми" />
      </View>
    );
  }
  if (status === 'error' || status === 'notfound' || !problem) {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <ErrorState
          label={status === 'notfound' ? 'Проблему не знайдено' : 'Не вдалося завантажити'}
          onRetry={status === 'error' ? load : undefined}
        />
      </View>
    );
  }

  const signedCount = petition ? petition.internalSignatures + (signed ? 1 : 0) : 0;
  const pct = Math.min(100, (signedCount / PETITION_GOAL) * 100);

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <StatusPill status={problem.status} />
          {problem.pointName ? (
            <Text style={{ color: palette.muted, fontSize: 13 * baseScale }}>{problem.pointName}</Text>
          ) : null}
        </View>
        <Text style={[styles.h1, { color: palette.text, fontSize: 23 * baseScale }]}>{problem.title}</Text>
        {problem.description ? (
          <Text style={{ color: palette.text, fontSize: 15 * baseScale, lineHeight: 22 * baseScale }}>
            {problem.description}
          </Text>
        ) : null}

        {problem.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {problem.photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.confirmRow}>
          <Button
            title={confirmed ? '✓ Ви підтвердили' : 'Я теж це бачу'}
            variant={confirmed ? 'secondary' : 'primary'}
            disabled={confirmed}
            loading={busy && !confirmed}
            onPress={onConfirm}
          />
          <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontWeight: '700', fontSize: 14 * baseScale }}>
            {confirms} підтверджень
          </Text>
        </View>

        {!petition && confirms >= ESCALATE_AT ? (
          <View style={[styles.escalate, { backgroundColor: palette.warnBg, borderColor: palette.warnLine }]}>
            <Text style={{ color: palette.warn, fontWeight: '800', fontSize: 12 * baseScale, textTransform: 'uppercase' }}>
              Готово до ескалації
            </Text>
            <Text style={{ color: palette.text, fontWeight: '800', fontSize: 17 * baseScale, marginTop: space.xs }}>
              Цей бар’єр підтвердили {confirms} людей
            </Text>
            <Text style={{ color: palette.muted, fontSize: 14 * baseScale, lineHeight: 20 * baseScale, marginVertical: space.sm }}>
              Достатньо підтверджень, щоб передати проблему місту. Створіть петицію за готовою чернеткою.
            </Text>
            {!draftOpen ? (
              <Button title="Створити петицію" onPress={openDraft} />
            ) : (
              <View style={{ gap: space.sm }}>
                <Field label="Заголовок" value={draftTitle} onChangeText={setDraftTitle} />
                <Field
                  label="Текст звернення"
                  value={draftBody}
                  onChangeText={setDraftBody}
                  multiline
                  numberOfLines={5}
                  style={{ minHeight: 110, textAlignVertical: 'top' }}
                />
                <View style={styles.actions}>
                  <Button title="Скасувати" variant="ghost" onPress={() => setDraftOpen(false)} />
                  <Button title={creating ? 'Створення…' : 'Опублікувати'} onPress={submitPetition} loading={creating} />
                </View>
              </View>
            )}
          </View>
        ) : null}

        {petition ? (
          <View style={[styles.petition, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
            <Text style={{ color: palette.primary, fontWeight: '800', fontSize: 12 * baseScale, textTransform: 'uppercase' }}>
              Петиція
            </Text>
            <Text style={{ color: palette.text, fontWeight: '800', fontSize: 18 * baseScale, marginTop: space.xs }}>
              {petition.title}
            </Text>
            {petition.body ? (
              <Text style={{ color: palette.muted, fontSize: 14 * baseScale, lineHeight: 20 * baseScale, marginTop: space.xs }}>
                {petition.body}
              </Text>
            ) : null}

            <View style={styles.progressLabels}>
              <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13 * baseScale }}>{signedCount} підписів</Text>
              <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13 * baseScale }}>ціль {PETITION_GOAL}</Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ now: signedCount, min: 0, max: PETITION_GOAL }}
              style={[styles.track, { backgroundColor: palette.surface2 }]}
            >
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: palette.primary }} />
            </View>

            <View style={{ marginTop: space.md }}>
              <Button
                title={signed ? '✓ Ви підписали' : 'Підписати у застосунку'}
                variant={signed ? 'secondary' : 'primary'}
                disabled={signed}
                loading={busy && !signed}
                onPress={onSign}
              />
            </View>
            {petition.officialSignatureCount != null ? (
              <Text style={{ color: palette.muted, fontSize: 12 * baseScale, marginTop: space.sm }}>
                Офіційно зібрано: {petition.officialSignatureCount}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.sm },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  content: { padding: space.lg, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  h1: { fontWeight: '800' },
  photo: { width: 160, height: 120, borderRadius: radii.md, backgroundColor: '#0001' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginTop: space.sm },
  escalate: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg, marginTop: space.sm },
  petition: { borderWidth: 1, borderRadius: radii.lg, padding: space.lg, marginTop: space.sm },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, marginBottom: space.xs },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
