import Link from 'next/link';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Розділи',
    links: [
      { href: '/map', label: 'Мапа' },
      { href: '/civic', label: 'Громада' },
      { href: '/contribute', label: 'Додати місце' },
      { href: '/settings', label: 'Налаштування' },
    ],
  },
  {
    title: 'Правове',
    links: [
      { href: '/terms', label: 'Умови користування' },
      { href: '/privacy', label: 'Політика конфіденційності' },
    ],
  },
];

export function Footer() {
  return (
    <footer style={{ borderTop: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)', marginTop: 'auto' }}>
      <div
        style={{
          maxWidth: 1080, margin: '0 auto', padding: '2.4em 1.25em 1.6em',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.6em',
        }}
      >
        <div style={{ maxWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', marginBottom: '0.6em' }}>
            <span aria-hidden style={{ width: '1.9em', height: '1.9em', borderRadius: '0.5em', background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>◍</span>
            <span style={{ fontWeight: 800 }}>SafeCity</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>
            Інклюзивна мапа Львова — щоб місто було доступним для кожного.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.7em' }}>{col.title}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5em' }}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="sc-foc" style={{ color: 'var(--sc-text)', fontWeight: 600, fontSize: '0.9em', textDecoration: 'none' }}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.7em' }}>Про проєкт</div>
          <p style={{ margin: '0 0 0.5em', fontSize: '0.85em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>
            Громадський проєкт. Дані відкриті та підтримуються спільнотою.
          </p>
          <a href="mailto:hello@safecity.lviv.ua" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, fontSize: '0.85em', textDecoration: 'none' }}>hello@safecity.lviv.ua</a>
        </div>
      </div>

      <div style={{ borderTop: 'var(--sc-bw) solid var(--sc-border)', padding: '1em 1.25em', textAlign: 'center', color: 'var(--sc-muted)', fontSize: '0.8em' }}>
        © 2026 SafeCity · Львів, Україна · дані © OpenStreetMap, © CARTO
      </div>
    </footer>
  );
}
