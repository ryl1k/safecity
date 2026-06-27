import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';

export const metadata = { title: 'Політика конфіденційності — SafeCity' };

const UPDATED = '27 червня 2026 р.';

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '2em 1.25em 4em' }}>
        <Link href="/" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>‹ На головну</Link>
        <h1 style={{ margin: '0.5em 0 0.3em', fontSize: '2em', fontWeight: 800 }}>Політика конфіденційності</h1>
        <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)', fontSize: '0.85em' }}>Чинна з {UPDATED}</p>

        <div style={{ color: 'var(--sc-text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '1.4em' }}>
          <section>
            <h2 style={h2}>1. Загальне</h2>
            <p style={p}>Ця Політика пояснює, які персональні дані обробляє SafeCity, з якою метою та які права ви маєте. Ми дотримуємось Закону України «Про захист персональних даних» і принципів GDPR. Ми збираємо мінімум даних, потрібних для роботи Сервісу.</p>
          </section>

          <section>
            <h2 style={h2}>2. Які дані ми збираємо</h2>
            <p style={p}><strong>Профіль доступності</strong> (наприклад, потреби крісла колісного чи незрячих користувачів) за замовчуванням зберігається лише на вашому пристрої й не передається на сервер, поки ви не створите акаунт.</p>
            <p style={p}><strong>Дані облікового запису</strong>: електронна пошта та, за бажанням, відображуване ім’я.</p>
            <p style={p}><strong>Ваш внесок</strong>: додані місця, оцінки, відгуки, фотографії, повідомлення про проблеми, підтвердження та підписи під петиціями.</p>
            <p style={p}><strong>Технічні дані</strong>: мінімальні журнали, потрібні для безпеки й стабільності. Ми не використовуємо рекламні трекери.</p>
          </section>

          <section>
            <h2 style={h2}>3. Геолокація</h2>
            <p style={p}>Геопозиція використовується лише у вашому браузері чи застосунку — щоб показати місця поруч і прокласти маршрут. Вона запитується тільки за вашою дією і не зберігається на сервері без потреби.</p>
          </section>

          <section>
            <h2 style={h2}>4. Як ми використовуємо дані</h2>
            <p style={p}>Для надання та покращення Сервісу, показу вашого внеску іншим користувачам, модерації контенту, забезпечення безпеки й виконання правових обов’язків. Ми не продаємо ваші персональні дані.</p>
          </section>

          <section>
            <h2 style={h2}>5. Хто обробляє дані від нашого імені</h2>
            <p style={p}>Ми використовуємо Supabase (хостинг бази даних, автентифікація, сховище файлів) як обробника даних. Адреси для геокодування й маршрутів передаються до OpenStreetMap/Nominatim та OpenRouteService виключно для виконання вашого запиту. Базові мапи надає CARTO та OpenStreetMap.</p>
          </section>

          <section>
            <h2 style={h2}>6. Локальне сховище</h2>
            <p style={p}>Ми зберігаємо у локальному сховищі браузера ваші налаштування (профіль доступності, тему, розмір тексту) та технічну сесію входу. Це не рекламні cookie.</p>
          </section>

          <section>
            <h2 style={h2}>7. Зберігання даних</h2>
            <p style={p}>Дані акаунта зберігаються, поки існує акаунт. Публічний внесок може залишатися в Сервісі задля цілісності мапи навіть після видалення акаунта, але буде знеособлений на ваш запит.</p>
          </section>

          <section>
            <h2 style={h2}>8. Ваші права</h2>
            <p style={p}>Ви маєте право на доступ, виправлення, видалення та обмеження обробки своїх даних, а також на їх перенесення. Щоб скористатися цими правами або видалити акаунт, напишіть нам.</p>
          </section>

          <section>
            <h2 style={h2}>9. Діти</h2>
            <p style={p}>Сервіс не призначений для осіб молодше 16 років без згоди батьків або опікунів.</p>
          </section>

          <section>
            <h2 style={h2}>10. Зміни та контакти</h2>
            <p style={p}>Про суттєві зміни цієї Політики ми повідомимо в застосунку. З питань конфіденційності пишіть на <a className="sc-foc" href="mailto:support@safecity.lviv.ua" style={{ color: 'var(--sc-primary)', fontWeight: 700 }}>support@safecity.lviv.ua</a>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

const h2 = { margin: '0 0 0.3em', fontSize: '1.2em', fontWeight: 800 } as const;
const p = { margin: '0 0 0.5em', color: 'var(--sc-muted)' } as const;
