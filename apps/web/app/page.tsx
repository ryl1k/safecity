import Link from 'next/link';
import {
  SlidersHorizontal, MapPinned, Navigation, Megaphone, Store,
  Check, ArrowRight, MapPin, ShieldCheck, Image as ImageIcon, type LucideIcon,
} from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Testimonials } from '@/components/Testimonials';
import { Reveal } from '@/components/Reveal';
import { ScrollSnap } from '@/components/ScrollSnap';

// ── Capability section (one per "how it works" step) ──────────────────────────
const medallion = {
  position: 'relative', width: '4.6em', height: '4.6em', flexShrink: 0, borderRadius: '1.25em',
  background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center',
} as const;
const badgeNum = {
  position: 'absolute', top: '-0.55em', left: '-0.55em', width: '2em', height: '2em', borderRadius: '50%',
  background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.82em',
} as const;
const capCta = {
  display: 'inline-flex', alignItems: 'center', gap: '0.5em', minHeight: '3em', padding: '0 1.4em',
  borderRadius: '0.75em', fontWeight: 800, fontSize: '1.02em', textDecoration: 'none',
  background: 'var(--sc-primary)', color: 'var(--sc-on-primary)',
} as const;
const mockCard = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em',
} as const;

function VisualPanel({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative', minHeight: 300, borderRadius: '1.6em', overflow: 'hidden',
      border: 'var(--sc-bw) solid var(--sc-border)', display: 'grid', placeItems: 'center', padding: '2.2em',
      background: 'var(--sc-surface)', boxShadow: '0 18px 45px -22px rgba(0,0,0,0.35)',
    }}>
      <Icon aria-hidden size={230} className="sc-drift" style={{ position: 'absolute', right: '-2.4rem', bottom: '-2.4rem', color: 'var(--sc-primary)', opacity: 0.07, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>{children}</div>
    </div>
  );
}

function Capability({
  n, Icon, title, body, bullets, cta, flip, tint, visual,
}: {
  n: string; Icon: LucideIcon; title: string; body: string; bullets: string[];
  cta?: { href: string; label: string }; flip?: boolean; tint?: boolean; visual: React.ReactNode;
}) {
  return (
    <section
      className="sc-snap-section"
      style={{
        minHeight: '88vh', display: 'flex', alignItems: 'center', padding: '3.5em 0',
        // full-bleed tint band that fades to the base bg at the top/bottom edges, so
        // neighbouring sections blend into each other (no hard seam). color-mix keeps
        // it theme-aware — a teal band in light, a dark teal band in dark.
        background: tint
          ? 'linear-gradient(180deg, var(--sc-bg) 0%, color-mix(in srgb, var(--sc-primary) 14%, var(--sc-surface)) 26%, color-mix(in srgb, var(--sc-primary) 14%, var(--sc-surface)) 74%, var(--sc-bg) 100%)'
          : 'var(--sc-bg)',
      }}
    >
      <div className={`sc-cap-grid${flip ? ' sc-cap-flip' : ''}`} style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25em' }}>
        <Reveal className="sc-cap-text">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', alignItems: 'flex-start' }}>
            <span aria-hidden style={medallion}>
              <Icon size={38} />
              <span style={badgeNum}>{n}</span>
            </span>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.4vw, 2.4rem)', lineHeight: 1.12, letterSpacing: '-0.02em', fontWeight: 800, hyphens: 'none' }}>{title}</h2>
            <p style={{ margin: 0, fontSize: '1.08em', lineHeight: 1.6, color: 'var(--sc-muted)', maxWidth: '46ch' }}>{body}</p>
            <ul style={{ margin: '0.2em 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55em' }}>
              {bullets.map((b) => (
                <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6em', fontSize: '1em', lineHeight: 1.45 }}>
                  <Check size={18} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0, marginTop: '0.15em' }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {cta && (
              <Link href={cta.href} className="sc-foc" style={{ ...capCta, marginTop: '0.6em' }}>
                {cta.label} <ArrowRight size={18} aria-hidden />
              </Link>
            )}
          </div>
        </Reveal>
        <Reveal className="sc-cap-visual" delay={120}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

// ── Per-section mock visuals ──────────────────────────────────────────────────
const LEVELS: [string, string][] = [
  ['Високий рівень', 'var(--sc-ok)'],
  ['Середній рівень', 'var(--sc-warn)'],
  ['Низький рівень', 'var(--sc-bad)'],
];

function MobilityVisual() {
  return (
    <VisualPanel Icon={SlidersHorizontal}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
        {LEVELS.map(([label, c]) => (
          <div key={label} style={{ ...mockCard, display: 'flex', alignItems: 'center', gap: '0.7em', padding: '0.75em 0.95em', fontWeight: 700 }}>
            <span aria-hidden style={{ width: '0.8em', height: '0.8em', borderRadius: '50%', background: c }} />
            <span style={{ color: c }}>{label}</span>
          </div>
        ))}
      </div>
    </VisualPanel>
  );
}

function PlacesVisual() {
  const rows: [string, string, string][] = [
    ['Аптека «Здоровʼя»', 'var(--sc-ok)', 'Аптека'],
    ['Парк культури', 'var(--sc-warn)', 'Парк'],
    ['Книгарня «Слово»', 'var(--sc-bad)', 'Заклад'],
  ];
  return (
    <VisualPanel Icon={MapPinned}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
        {rows.map(([name, c, cat]) => (
          <div key={name} style={{ ...mockCard, display: 'flex', alignItems: 'center', gap: '0.6em', padding: '0.7em 0.9em' }}>
            <MapPin size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div style={{ fontSize: '0.72em', color: 'var(--sc-muted)' }}>{cat}</div>
            </div>
            <span aria-hidden style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', background: c, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </VisualPanel>
  );
}

function RouteVisual() {
  return (
    <VisualPanel Icon={Navigation}>
      <div style={{ ...mockCard, padding: '1.2em' }}>
        <svg viewBox="0 0 200 130" width="100%" role="img" aria-label="Приклад доступного маршруту" style={{ display: 'block' }}>
          <path d="M22,104 C64,104 62,50 100,50 S150,28 178,28" fill="none" stroke="var(--sc-primary)" strokeWidth="3.5" strokeLinecap="round" />
          {/* avoided barrier off-path */}
          <g transform="translate(118,86)">
            <circle r="9" fill="var(--sc-bad)" opacity="0.15" />
            <path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="var(--sc-bad)" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* start */}
          <circle cx="22" cy="104" r="6" fill="var(--sc-ok)" stroke="var(--sc-surface)" strokeWidth="2.5" />
          {/* end pin */}
          <circle cx="178" cy="28" r="7" fill="var(--sc-primary)" stroke="var(--sc-surface)" strokeWidth="2.5" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5em', fontSize: '0.72em', color: 'var(--sc-muted)', fontWeight: 700 }}>
          <span>Старт</span><span>Без сходів</span><span>Фініш</span>
        </div>
      </div>
    </VisualPanel>
  );
}

function ChangeVisual() {
  return (
    <VisualPanel Icon={Megaphone}>
      <div style={{ ...mockCard, padding: '1em', display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
        <div style={{ display: 'flex', gap: '0.5em', alignItems: 'center' }}>
          <span style={{ padding: '0.2em 0.65em', borderRadius: '2em', background: 'var(--sc-bad)', color: '#fff', fontSize: '0.7em', fontWeight: 800 }}>Серйозна</span>
          <span style={{ fontSize: '0.72em', color: 'var(--sc-muted)' }}>Нове повідомлення</span>
        </div>
        <div style={{ fontWeight: 700 }}>Немає пандуса біля входу</div>
        <div style={{ height: 66, borderRadius: '0.6em', background: 'var(--sc-primary-tint)', display: 'grid', placeItems: 'center', color: 'var(--sc-primary)' }}>
          <ImageIcon size={22} aria-hidden />
        </div>
      </div>
    </VisualPanel>
  );
}

function BusinessVisual() {
  return (
    <VisualPanel Icon={Store}>
      <div style={{ ...mockCard, padding: '1.1em', display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5em', alignSelf: 'flex-start', color: 'var(--sc-ok)', fontWeight: 800, background: 'var(--sc-ok-bg)', border: 'var(--sc-bw) solid var(--sc-ok-line)', borderRadius: '2em', padding: '0.3em 0.8em', fontSize: '0.85em' }}>
          <ShieldCheck size={16} aria-hidden /> Перевірено
        </span>
        <div style={{ fontWeight: 700 }}>Кавʼярня «Затишок»</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4em' }}>
          <span style={{ fontSize: '1.5em', fontWeight: 800, color: 'var(--sc-primary)' }}>+37%</span>
          <span style={{ fontSize: '0.8em', color: 'var(--sc-muted)' }}>відвідувачів за місяць</span>
        </div>
      </div>
    </VisualPanel>
  );
}

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ScrollSnap />
      <AppHeader />

      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%' }}>
        {/* Hero — full-width title */}
        <section style={{ maxWidth: 1080, margin: '0 auto', padding: '3em 1.25em 2em', textAlign: 'center' }}>
          <p style={{ fontSize: '0.78em', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sc-primary)', margin: 0 }}>
            Інклюзивна мапа · ваше місто
          </p>
          <h1 style={{ margin: '0.25em auto', fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', lineHeight: 1.08, letterSpacing: '-0.03em', fontWeight: 800, maxWidth: '18ch' }}>
            Один застосунок, що адаптується під вас
          </h1>
          <p style={{ margin: '0 auto', maxWidth: '64ch', fontSize: '1.1em', lineHeight: 1.6, color: 'var(--sc-muted)' }}>
            SafeCity допомагає людям з інвалідністю орієнтуватися в місті: знайте заздалегідь,
            чи підходить вам місце, прокладайте маршрут під свої потреби, а коли щось не так —
            повідомте й домагайтеся змін.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8em', marginTop: '1.8em', justifyContent: 'center' }}>
            <Link href="/map" className="sc-foc" style={cta('primary')}>Відкрити мапу</Link>
            <Link href="/places" className="sc-foc" style={cta('secondary')}>Переглянути місця</Link>
          </div>
        </section>

        {/* Looping reviews */}
        <section style={{ padding: '0.5em 0 2.5em' }}>
          <Testimonials />
        </section>

        {/* How it works — intro + full scroll-locked capability sections */}
        <section style={{ maxWidth: 1080, margin: '0 auto', padding: '1em 1.25em 0', textAlign: 'center' }}>
          <p style={{ fontSize: '0.78em', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sc-primary)', margin: 0 }}>Як це працює</p>
          <h2 style={{ margin: '0.25em auto 0', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.02em', maxWidth: '20ch' }}>
            Від пошуку місця до реальних змін у місті
          </h2>
          <p aria-hidden style={{ margin: '1.4em 0 0', color: 'var(--sc-muted)', fontSize: '1.5em' }}>↓</p>
        </section>

        <Capability
          n="1" Icon={SlidersHorizontal} title="Створено для мобільності" tint
          body="SafeCity зроблено насамперед для людей на кріслі колісному та з обмеженою мобільністю. Кожне місце ми оцінюємо за реальними бар’єрами — вхід, двері, пандус, туалет — і показуємо зрозумілий рівень доступності, тож ви знаєте, чи підходить вам місце, ще до виходу з дому."
          bullets={['Оцінка доступності для крісла колісного', 'Зрозумілі рівні: високий, середній, низький', 'Комфортна тема та розмір шрифту під ваші потреби']}
          visual={<MobilityVisual />}
        />
        <Capability
          n="2" Icon={MapPinned} title="Знаходьте доступні місця" flip
          body="Заклади, аптеки, транспорт, парки — тисячі точок із позначками доступності. Шукайте за назвою чи адресою, фільтруйте за категоріями та зручностями й одразу бачте, що чекає на вході, ще до візиту."
          bullets={['Пошук за назвою чи адресою', 'Фільтри за категоріями та зручностями', 'Деталі кожної точки: вхід, двері, туалет, паркування']}
          cta={{ href: '/places', label: 'Переглянути місця' }}
          visual={<PlacesVisual />}
        />
        <Capability
          n="3" Icon={Navigation} title="Прокладайте безпечний маршрут" tint
          body="Маршрути без сходів і з пологими ділянками, що оминають підтверджені бар’єри. Додавайте проміжні зупинки, а дорогою застосунок підкаже доступні місця поруч зі шляхом."
          bullets={['Маршрути без сходів і високих бордюрів', 'Оминання підтверджених бар’єрів', 'Доступні місця вздовж шляху']}
          cta={{ href: '/map', label: 'Відкрити мапу' }}
          visual={<RouteVisual />}
        />
        <Capability
          n="4" Icon={Megaphone} title="Змінюйте місто" flip
          body="Місто стає доступним, коли ми будуємо його разом. Додавайте нові місця, яких ще немає на мапі, і повідомляйте про бар’єри з фото — кожне звернення робить SafeCity точнішим для наступної людини."
          bullets={['Додавайте власні місця на мапу', 'Повідомляйте про бар’єри з фото', 'Разом будуємо доступне місто']}
          cta={{ href: '/problem/new', label: 'Повідомити про проблему' }}
          visual={<ChangeVisual />}
        />
        <Capability
          n="5" Icon={Store} title="Зробіть ваш бізнес доступним" tint
          body="Позначте свій заклад на мапі — і покажіть клієнтам, що до вас легко потрапити. Доступні місця отримують значок довіри, помітніші в пошуку та привертають відвідувачів, які інакше пройшли б повз."
          bullets={['Значок «Перевірено» для довіри', 'Більше клієнтів, які шукають доступність', 'Керуйте своїми точками з панелі бізнесу']}
          cta={{ href: '/contribute', label: 'Додати свій заклад' }}
          visual={<BusinessVisual />}
        />

        {/* CTA band — leave as the closing call to build the city together */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2em 1.25em 4em' }}>
          <section style={{ ...cardStyle, textAlign: 'center', background: 'var(--sc-primary-tint)', borderColor: 'var(--sc-primary)', padding: '2em 1.3em' }}>
            <h2 style={{ margin: '0 0 0.3em', fontSize: '1.3em', fontWeight: 800 }}>Зробимо ваше місто доступним разом</h2>
            <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)' }}>Зрозумілий, зручний і доступний для кожного.</p>
            <Link
              href="/map"
              className="sc-foc"
              style={{ display: 'grid', placeItems: 'center', width: 'min(100%, 52em)', minHeight: '3.4em', margin: '0 auto', padding: '0 1.5em', borderRadius: '0.8em', fontWeight: 800, fontSize: '1.05em', textDecoration: 'none', background: 'var(--sc-primary)', color: 'var(--sc-on-primary)' }}
            >
              Відкрити мапу
            </Link>
          </section>
        </div>
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

function cta(kind: 'primary' | 'secondary') {
  const base = {
    display: 'grid', placeItems: 'center', minHeight: '2.75em', padding: '0 1.5em',
    borderRadius: '0.7em', fontWeight: 700, textDecoration: 'none',
  } as const;
  return kind === 'primary'
    ? { ...base, background: 'var(--sc-primary)', color: 'var(--sc-on-primary)' }
    : { ...base, background: 'var(--sc-surface)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)' };
}
