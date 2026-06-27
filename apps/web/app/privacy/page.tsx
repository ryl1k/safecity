import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';

export const metadata = { title: 'Політика конфіденційності — SafeCity' };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '2em 1.25em 4em' }}>
        <Link href="/" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>‹ На головну</Link>
        <h1 style={{ margin: '0.5em 0 0.8em', fontSize: '2em', fontWeight: 800 }}>Політика конфіденційності</h1>
        <div style={{ color: 'var(--sc-text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '1em' }}>
          <p style={{ margin: 0, color: 'var(--sc-muted)' }}>Демонстраційна версія. Остаточний текст буде додано перед публічним запуском.</p>
          <section><h2 style={h2}>Які дані ми збираємо</h2><p style={p}>Профіль доступності зберігається на вашому пристрої. Якщо ви створюєте акаунт, ми зберігаємо вашу пошту та ваш внесок (місця, відгуки, повідомлення).</p></section>
          <section><h2 style={h2}>Місцезнаходження</h2><p style={p}>Геолокація використовується лише для показу місць поруч і прокладання маршрутів. Вона не зберігається без вашої дії.</p></section>
          <section><h2 style={h2}>Ваші права</h2><p style={p}>Ви можете будь-коли запитати видалення акаунта та пов’язаних даних, написавши нам.</p></section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

const h2 = { margin: '0 0 0.3em', fontSize: '1.2em', fontWeight: 800 } as const;
const p = { margin: 0, color: 'var(--sc-muted)' } as const;
