import Link from 'next/link';
import { Accessibility, Eye } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { HeroMap } from '@/components/HeroMap';

const STEPS = [
  { n: '1', title: 'Налаштуйте під себе', body: 'Оберіть свої потреби — застосунок адаптує інтерфейс, шари мапи й маршрути саме під вас.' },
  { n: '2', title: 'Знайдіть доступні місця', body: 'Кожне місце має оцінку доступності окремо для крісла колісного й для незрячих — колір, іконка та підпис.' },
  { n: '3', title: 'Змінюйте місто', body: 'Повідомляйте про бар’єри, підтримуйте петиції до міста — і стежте, як їх усувають.' },
];

const PROFILES = [
  {
    title: 'Крісло колісне та мобільність',
    body: 'Візуальна мапа з пін-ами за кольором і формою, маршрути без сходів і з пологими ділянками, доступні туалети й паркування.',
    Icon: Accessibility,
  },
  {
    title: 'Незрячі та слабкозорі',
    body: 'Аудіо-перший список місць поруч із напрямком за годинником, висока контрастність, великий шрифт, озвучення та вібрація.',
    Icon: Eye,
  },
];

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />

      <main style={{ flex: 1, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '2.4em 1.25em 4em' }}>
        {/* Hero — text + live map */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2em', alignItems: 'center', marginBottom: '3em' }}>
          <div>
            <p style={{ fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sc-primary)', margin: 0 }}>
              Інклюзивна мапа · Львів
            </p>
            <h1 style={{ margin: '0.3em 0', fontSize: '2.4em', lineHeight: 1.1, letterSpacing: '-0.025em', fontWeight: 800 }}>
              Один застосунок, що адаптується під вас
            </h1>
            <p style={{ margin: 0, maxWidth: '52ch', fontSize: '1.05em', lineHeight: 1.6, color: 'var(--sc-muted)' }}>
              SafeCity допомагає людям з інвалідністю орієнтуватися в місті: знайте заздалегідь,
              чи підходить вам місце, прокладайте маршрут під свої потреби, а коли щось не так —
              повідомте й домагайтеся змін.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8em', marginTop: '1.6em' }}>
              <Link href="/onboarding" className="sc-foc" style={cta('primary')}>Почати</Link>
              <Link href="/map" className="sc-foc" style={cta('secondary')}>Відкрити мапу</Link>
            </div>
          </div>
          <HeroMap />
        </section>

        {/* How it works */}
        <section style={{ marginBottom: '3em' }}>
          <h2 style={{ fontSize: '1.4em', fontWeight: 800, margin: '0 0 1em' }}>Як це працює</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1em' }}>
            {STEPS.map((s) => (
              <div key={s.n} style={cardStyle}>
                <span aria-hidden style={stepDot}>{s.n}</span>
                <h3 style={{ margin: '0.6em 0 0.3em', fontSize: '1.1em', fontWeight: 800 }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: '0.92em', lineHeight: 1.5, color: 'var(--sc-muted)' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Two profiles */}
        <section style={{ marginBottom: '3em' }}>
          <h2 style={{ fontSize: '1.4em', fontWeight: 800, margin: '0 0 1em' }}>Два досвіди, один застосунок</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1em' }}>
            {PROFILES.map(({ title, body, Icon }) => (
              <div key={title} style={{ ...cardStyle, display: 'flex', gap: '0.9em', alignItems: 'flex-start' }}>
                <span aria-hidden style={iconSquare}>
                  <Icon size={26} />
                </span>
                <div>
                  <h3 style={{ margin: '0 0 0.3em', fontSize: '1.1em', fontWeight: 800 }}>{title}</h3>
                  <p style={{ margin: 0, fontSize: '0.92em', lineHeight: 1.5, color: 'var(--sc-muted)' }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section style={{ ...cardStyle, textAlign: 'center', background: 'var(--sc-primary-tint)', borderColor: 'var(--sc-primary)' }}>
          <h2 style={{ margin: '0 0 0.3em', fontSize: '1.3em', fontWeight: 800 }}>Зробимо Львів доступним разом</h2>
          <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)' }}>Зрозумілий, зручний і доступний для кожного.</p>
          <Link href="/onboarding" className="sc-foc" style={cta('primary')}>Налаштувати під себе</Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const cardStyle = {
  background: 'var(--sc-surface)',
  border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em',
  padding: '1.3em',
} as const;

const stepDot = {
  display: 'grid', placeItems: 'center', width: '2em', height: '2em', borderRadius: '0.6em',
  background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', fontWeight: 800,
} as const;

const iconSquare = {
  display: 'grid', placeItems: 'center', width: '2.6em', height: '2.6em', flexShrink: 0,
  borderRadius: '0.7em', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)',
} as const;

function cta(kind: 'primary' | 'secondary') {
  const base = {
    display: 'grid', placeItems: 'center', minHeight: '2.75em', padding: '0 1.5em',
    borderRadius: '0.7em', fontWeight: 700, textDecoration: 'none',
  } as const;
  return kind === 'primary'
    ? { ...base, background: 'var(--sc-primary)', color: 'var(--sc-on-primary)' }
    : { ...base, background: 'var(--sc-surface)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)' };
}
