'use client';

import { useState } from 'react';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import {
  Button,
  Field,
  Chip,
  Segmented,
  Switch,
  SearchBar,
  RatingBadge,
  PinLegend,
  ListRow,
  ChecklistRow,
  ReviewItem,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.4em' }}>
      <h2 style={{ margin: '0 0 0.9em', fontSize: '1.3em', fontWeight: 800 }}>{title}</h2>
      <div
        style={{
          background: 'var(--sc-surface)',
          border: 'var(--sc-bw) solid var(--sc-border)',
          borderRadius: '1em',
          padding: '1.3em',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1em',
          alignItems: 'flex-start',
        }}
      >
        {children}
      </div>
    </section>
  );
}

export default function KitPage() {
  const [chips, setChips] = useState({ acc: true, wc: false, tactile: false, ramp: false });
  const [seg, setSeg] = useState<'map' | 'list'>('map');
  const [voice, setVoice] = useState(true);
  const [q, setQ] = useState('');

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20, background: 'var(--sc-surface)',
          borderBottom: 'var(--sc-bw) solid var(--sc-border)',
        }}
      >
        <div
          style={{
            maxWidth: 1080, margin: '0 auto', padding: '0.7em 1.25em',
            display: 'flex', alignItems: 'center', gap: '1em', flexWrap: 'wrap',
          }}
        >
          <strong style={{ marginRight: 'auto' }}>SafeCity · Дизайн-система</strong>
          <ThemeSwitcher />
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '1.6em 1.25em 5em' }}>
        <Section title="Кнопки">
          <Button>Маршрут</Button>
          <Button variant="accent">Режим ходьби</Button>
          <Button variant="secondary">Зберегти</Button>
          <Button variant="ghost">Пропустити</Button>
          <Button variant="danger">Повідомити</Button>
          <Button disabled>Неактивна</Button>
        </Section>

        <Section title="Поля й форми">
          <div style={{ minWidth: 220, flex: 1 }}>
            <Field label="Пошта" type="email" placeholder="you@city.ua" help="Потрібно лише для внеску." />
          </div>
          <div style={{ minWidth: 220, flex: 1 }}>
            <Field label="Пароль" type="password" defaultValue="123" error="Щонайменше 8 символів" />
          </div>
        </Section>

        <Section title="Контроли">
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
            <SearchBar value={q} onChange={setQ} ariaLabel="Пошук місць" placeholder="Пошук місць, транспорту, переходів" onVoice={() => {}} />
            <div role="group" aria-label="Фільтри" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55em' }}>
              <Chip pressed={chips.acc} onToggle={() => setChips((c) => ({ ...c, acc: !c.acc }))}>
                <span aria-hidden>✓</span> Лише доступні
              </Chip>
              <Chip pressed={chips.wc} onToggle={() => setChips((c) => ({ ...c, wc: !c.wc }))}>Доступний туалет</Chip>
              <Chip pressed={chips.tactile} onToggle={() => setChips((c) => ({ ...c, tactile: !c.tactile }))}>Тактильна плитка</Chip>
              <Chip pressed={chips.ramp} onToggle={() => setChips((c) => ({ ...c, ramp: !c.ramp }))}>Без сходів / пандус</Chip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2em' }}>
              <Segmented
                ariaLabel="Режим"
                value={seg}
                onChange={setSeg}
                options={[
                  { value: 'map', label: 'Мапа' },
                  { value: 'list', label: 'Список' },
                ]}
              />
              <Switch checked={voice} onChange={() => setVoice((v) => !v)} label="Голос і вібрація" />
            </div>
          </div>
        </Section>

        <Section title="Бейдж рейтингу">
          <RatingBadge rating="full" />
          <RatingBadge rating="partial" />
          <RatingBadge rating="none" />
          <RatingBadge rating="unknown" />
        </Section>

        <Section title="Пін-и мапи й легенда">
          <div style={{ width: '100%' }}>
            <PinLegend />
          </div>
        </Section>

        <Section title="Рядки · чек-лист · відгук">
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1em' }}>
            <div>
              <ListRow name="Aroma Kava" rating="full" meta="Кафе · 40 м · на 2 годині · без сходів, туалет" />
              <ListRow name="Аптека Галицька" rating="partial" meta="Аптека · 120 м · на 10 годині · вузькі двері" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9em' }}>
              <div>
                <ChecklistRow label="Без сходів при вході" value="yes" critical />
                <ChecklistRow label="Доступний туалет" value="no" critical />
                <ChecklistRow label="Тактильна плитка" value="unknown" last />
              </div>
              <ReviewItem
                author="Олена"
                profileTag="користувачка крісла"
                timeAgo="2 дні тому"
                text="Пандус біля бічного входу пологий, персонал відчинив двері. Двері туалету трохи вузькі."
              />
            </div>
          </div>
        </Section>

        <Section title="Порожньо · завантаження · помилка">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '0.9em', width: '100%' }}>
            <EmptyState title="Поки немає місць" message="Станьте першим, хто додасть цей район." actionLabel="Додати місце" onAction={() => {}} />
            <LoadingState />
            <ErrorState onRetry={() => {}} />
          </div>
        </Section>
      </main>
    </div>
  );
}
