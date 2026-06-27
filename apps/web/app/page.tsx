import Link from 'next/link';
import { Accessibility, Eye, SlidersHorizontal, MapPinned, Megaphone, type LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Testimonials } from '@/components/Testimonials';
import { Reveal } from '@/components/Reveal';

const STEPS: { n: string; title: string; body: string; Icon: LucideIcon }[] = [
  { n: '1', title: 'Налаштуйте під себе', body: 'Оберіть свої потреби — застосунок адаптує інтерфейс, шари мапи й маршрути саме під вас.', Icon: SlidersHorizontal },
  { n: '2', title: 'Знайдіть доступні місця', body: 'Кожне місце має оцінку доступності окремо для крісла колісного й для незрячих — колір, іконка та підпис.', Icon: MapPinned },
  { n: '3', title: 'Змінюйте місто', body: 'Повідомляйте про бар’єри, підтримуйте петиції до міста — і стежте, як їх усувають.', Icon: Megaphone },
];

const PROFILES: { title: string; body: string; Icon: LucideIcon }[] = [
  { title: 'Крісло колісне та мобільність', body: 'Візуальна мапа з пін-ами за кольором і формою, маршрути без сходів і з пологими ділянками, доступні туалети й паркування.', Icon: Accessibility },
  { title: 'Незрячі та слабкозорі', body: 'Аудіо-перший список місць поруч із напрямком за годинником, висока контрастність, великий шрифт, озвучення та вібрація.', Icon: Eye },
];

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />

      <main style={{ flex: 1, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '2.4em 1.25em 4em' }}>
        {/* Hero — text + testimonials */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.4em', alignItems: 'center', marginBottom: '3.5em' }}>
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
          <Testimonials />
        </section>

        {/* How it works — a tall block per step, revealed on scroll */}
        <section style={{ marginBottom: '4em' }}>
          <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: '0 0 1.2em' }}>Як це працює</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div
                  style={{
                    display: 'flex', flexDirection: i % 2 === 1 ? 'row-reverse' : 'row', flexWrap: 'wrap',
                    gap: '1.8em', alignItems: 'center', background: 'var(--sc-surface)',
                    border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1.3em', padding: '2.2em',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: 'relative', width: '5em', height: '5em', flexShrink: 0, borderRadius: '1.2em',
                      background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center',
                    }}
                  >
                    <s.Icon size={34} />
                    <span style={{ position: 'absolute', top: '-0.5em', left: '-0.5em', width: '1.8em', height: '1.8em', borderRadius: '50%', background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.85em' }}>
                      {s.n}
                    </span>
                  </span>
                  <div style={{ flex: '1 1 280px' }}>
                    <h3 style={{ margin: '0 0 0.35em', fontSize: '1.35em', fontWeight: 800 }}>{s.title}</h3>
                    <p style={{ margin: 0, fontSize: '1.02em', lineHeight: 1.55, color: 'var(--sc-muted)', maxWidth: '56ch' }}>{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Two profiles */}
        <section style={{ marginBottom: '3em' }}>
          <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: '0 0 1.2em' }}>Два досвіди, один застосунок</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1em' }}>
            {PROFILES.map(({ title, body, Icon }) => (
              <Reveal key={title}>
                <div style={{ ...cardStyle, display: 'flex', gap: '0.9em', alignItems: 'flex-start', height: '100%' }}>
                  <span aria-hidden style={iconSquare}>
                    <Icon size={26} />
                  </span>
                  <div>
                    <h3 style={{ margin: '0 0 0.3em', fontSize: '1.1em', fontWeight: 800 }}>{title}</h3>
                    <p style={{ margin: 0, fontSize: '0.92em', lineHeight: 1.5, color: 'var(--sc-muted)' }}>{body}</p>
                  </div>
                </div>
              </Reveal>
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
