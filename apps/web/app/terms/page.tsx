import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';

export const metadata = { title: 'Умови користування — SafeCity' };

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '2em 1.25em 4em' }}>
        <Link href="/" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>‹ На головну</Link>
        <h1 style={{ margin: '0.5em 0 0.8em', fontSize: '2em', fontWeight: 800 }}>Умови користування</h1>
        <div style={{ color: 'var(--sc-text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '1em' }}>
          <p style={{ margin: 0, color: 'var(--sc-muted)' }}>Демонстраційна версія. Остаточний текст буде додано перед публічним запуском.</p>
          <section><h2 style={h2}>Використання сервісу</h2><p style={p}>SafeCity надає інформацію про доступність місць у Львові на основі даних спільноти. Інформація може бути неповною — перевіряйте важливі деталі на місці.</p></section>
          <section><h2 style={h2}>Внесок користувачів</h2><p style={p}>Додаючи місця, відгуки чи повідомлення про проблеми, ви погоджуєтесь, що вони стануть доступними іншим користувачам. Не публікуйте недостовірну чи образливу інформацію.</p></section>
          <section><h2 style={h2}>Відповідальність</h2><p style={p}>Сервіс надається «як є». Ми прагнемо точності, але не гарантуємо її та не несемо відповідальності за рішення, ухвалені на основі даних.</p></section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

const h2 = { margin: '0 0 0.3em', fontSize: '1.2em', fontWeight: 800 } as const;
const p = { margin: 0, color: 'var(--sc-muted)' } as const;
