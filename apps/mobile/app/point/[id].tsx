import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AccessibilityFeature, PointSummary } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { Button, Card, ErrorState, Field, LoadingState } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { RatingBadge } from '@/components/RatingBadge';
import { ChecklistRow } from '@/components/ui/ChecklistRow';
import { ReviewItem } from '@/components/ui/ReviewItem';
import { getCatalog } from '@/lib/catalog';
import { categoryLabel } from '@/lib/format';
import { successFeedback } from '@/lib/haptics';
import { pointById } from '@/lib/points';
import { addReview, reviewsFor, type ReviewRow } from '@/lib/reviews';
import { uploadPhotos } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/state/ProfileProvider';
import { radii, space, useTheme } from '@/theme/theme';

export default function PointDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette, baseScale } = useTheme();
  const { primary } = useProfile();

  const [point, setPoint] = useState<PointSummary | null>(null);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [showAll, setShowAll] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  // review form
  const [authed, setAuthed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setStatus('loading');
    try {
      const [cat, p, revs, session] = await Promise.all([
        getCatalog(),
        pointById(id),
        reviewsFor(id),
        supabase.auth.getSession(),
      ]);
      if (!p) {
        setStatus('notfound');
        return;
      }
      setCatalog(cat);
      setPoint(p);
      setReviews(revs);
      setAuthed(Boolean(session.data.session));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitReview() {
    if (stars < 1) {
      setFormError('Оберіть оцінку від 1 до 5.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const photoUrls = await uploadPhotos(photos, 'reviews');
      await addReview(id, primary, stars, text.trim(), photoUrls);
      successFeedback();
      setReviews(await reviewsFor(id));
      setFormOpen(false);
      setStars(0);
      setText('');
      setPhotos([]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Не вдалося надіслати відгук');
    } finally {
      setSaving(false);
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

  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <LoadingState />
      </View>
    );
  }
  if (status === 'error' || status === 'notfound' || !point) {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg }]}>
        {Header}
        <ErrorState
          label={status === 'notfound' ? 'Місце не знайдено' : 'Не вдалося завантажити місце'}
          onRetry={status === 'error' ? load : undefined}
        />
      </View>
    );
  }

  const rating = computeRating(point.features, catalog, point.category, primary);
  const applicable = catalog
    .filter((f) => f.profile === primary && f.categories.includes(point.category))
    .sort((a, b) => Number(b.critical) - Number(a.critical));
  const critical = applicable.filter((f) => f.critical);
  const shown = showAll ? applicable : critical;

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.name, { color: palette.text, fontSize: 24 * baseScale }]}>{point.name}</Text>
        <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>
          {categoryLabel[point.category]}
          {point.address ? ` · ${point.address}` : ''}
        </Text>

        {/* Photos + description first — discovery before accessibility detail */}
        {point.photos && point.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {point.photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
            ))}
          </ScrollView>
        ) : null}

        {point.description ? (
          <Text style={{ color: palette.text, fontSize: 15 * baseScale, lineHeight: 22 * baseScale }}>
            {point.description}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button title="Маршрут сюди" onPress={() => router.push(`/route?to=${id}`)} />
          <Button
            title="Повідомити про проблему"
            variant="secondary"
            onPress={() =>
              authed ? router.push(`/problem/new?point=${id}`) : router.push(`/auth?next=/problem/new?point=${id}`)
            }
          />
        </View>

        {/* Accessibility — secondary, collapsed. No prominent grey badge. */}
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: accessOpen }}
            onPress={() => setAccessOpen((o) => !o)}
            style={styles.accessHead}
          >
            <Text style={[styles.section, { color: palette.text, fontSize: 16 * baseScale }]}>Доступність</Text>
            {rating !== 'unknown' ? <RatingBadge rating={rating} /> : null}
            <Text style={{ marginLeft: 'auto', color: palette.muted, fontSize: 16 * baseScale }}>
              {accessOpen ? '▾' : '▸'}
            </Text>
          </Pressable>
          {accessOpen ? (
            shown.length === 0 ? (
              <Text style={{ color: palette.muted, fontSize: 14 * baseScale, marginTop: space.sm }}>
                Поки немає даних про доступність.
              </Text>
            ) : (
              <View style={{ marginTop: space.sm }}>
                {shown.map((f, i) => (
                  <ChecklistRow
                    key={f.key}
                    label={f.label}
                    value={point.features[f.key] ?? 'unknown'}
                    critical={f.critical}
                    last={i === shown.length - 1}
                  />
                ))}
                {applicable.length > critical.length ? (
                  <Pressable accessibilityRole="button" onPress={() => setShowAll((s) => !s)} style={styles.linkBtn}>
                    <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 14 * baseScale }}>
                      {showAll ? 'Згорнути' : `Показати всі критерії (${applicable.length})`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          ) : null}
        </Card>

        <View style={styles.reviewsHead}>
          <Text style={[styles.section, { color: palette.text, fontSize: 17 * baseScale }]}>Відгуки</Text>
          {!formOpen ? (
            <Button
              title="Написати відгук"
              variant="secondary"
              onPress={() => (authed ? setFormOpen(true) : router.push(`/auth?next=/point/${id}`))}
            />
          ) : null}
        </View>

        {formOpen ? (
          <Card>
            <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>Ваша оцінка</Text>
            <View accessibilityRole="radiogroup" style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: stars >= n }}
                  accessibilityLabel={`${n} з 5`}
                  onPress={() => setStars(n)}
                  hitSlop={6}
                >
                  <Text style={{ fontSize: 30 * baseScale, color: stars >= n ? palette.warn : palette.border }}>★</Text>
                </Pressable>
              ))}
            </View>
            <Field
              label="Коментар"
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={4}
              placeholder="Поділіться досвідом доступності цього місця"
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
            <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 * baseScale }}>Фото (необов’язково)</Text>
            <PhotoInput uris={photos} onChange={setPhotos} />
            {formError ? <Text style={{ color: palette.bad }}>{formError}</Text> : null}
            <View style={styles.formActions}>
              <Button title="Скасувати" variant="ghost" onPress={() => setFormOpen(false)} />
              <Button title="Надіслати" onPress={submitReview} loading={saving} />
            </View>
          </Card>
        ) : null}

        {reviews.length === 0 ? (
          <Text style={{ color: palette.muted, fontSize: 14 * baseScale }}>Ще немає відгуків.</Text>
        ) : (
          reviews.map((r) => <ReviewItem key={r.id} review={r} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.sm },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  content: { padding: space.lg, gap: space.md },
  name: { fontWeight: '800' },
  section: { fontWeight: '800' },
  photo: { width: 220, height: 160, borderRadius: radii.md, backgroundColor: '#0001' },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  accessHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  actions: { gap: space.sm },
  reviewsHead: { gap: space.sm },
  stars: { flexDirection: 'row', gap: space.sm, marginVertical: space.sm },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
