import Link from 'next/link';

const links = [
  { href: '/map', label: 'Мапа' },
  { href: '/civic', label: 'Громада' },
  { href: '/contribute', label: 'Додати місце' },
  { href: '/settings', label: 'Налаштування' },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: 'var(--sc-bw) solid var(--sc-border)',
        background: 'var(--sc-surface)',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '1.6em 1.25em',
          display: 'flex',
          gap: '1em',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', marginRight: 'auto' }}>
          <span
            aria-hidden
            style={{
              width: '1.8em', height: '1.8em', borderRadius: '0.5em', background: 'var(--sc-primary)',
              color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800,
            }}
          >
            ◍
          </span>
          <span style={{ fontWeight: 800 }}>SafeCity</span>
        </div>
        <nav aria-label="Підвал" style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="sc-foc" style={{ color: 'var(--sc-muted)', fontWeight: 600, fontSize: '0.9em', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div style={{ borderTop: 'var(--sc-bw) solid var(--sc-border)', padding: '0.9em 1.25em', textAlign: 'center', color: 'var(--sc-muted)', fontSize: '0.8em' }}>
        SafeCity · Львів, Україна · дані © OpenStreetMap
      </div>
    </footer>
  );
}
