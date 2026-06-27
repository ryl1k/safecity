const QUOTES = [
  { name: 'Олена', tag: 'користувачка крісла', text: 'Нарешті бачу заздалегідь, чи зможу заїхати. Заощаджує стільки нервів і часу.' },
  { name: 'Андрій', tag: 'незрячий', text: 'Аудіо-список із напрямком — саме те, чого бракувало в інших мапах.' },
  { name: 'Марія', tag: 'мама з візочком', text: 'Повідомила про відсутній пандус — і за два тижні його зробили. Працює!' },
  { name: 'Ігор', tag: 'на милицях', text: 'Маршрути без сходів економлять мені сили щодня.' },
  { name: 'Софія', tag: 'волонтерка', text: 'Додавати місця легко — і це реально допомагає людям навколо.' },
];

function Card({ q }: { q: (typeof QUOTES)[number] }) {
  return (
    <figure
      style={{
        margin: 0, width: 'min(78vw, 320px)', flexShrink: 0, scrollSnapAlign: 'start',
        background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
        borderRadius: '1em', padding: '1.1em 1.2em', boxShadow: 'var(--sc-shadow-1)',
      }}
    >
      <blockquote style={{ margin: 0, fontSize: '0.95em', lineHeight: 1.5 }}>«{q.text}»</blockquote>
      <figcaption style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginTop: '0.8em' }}>
        <span aria-hidden style={{ width: '2.2em', height: '2.2em', borderRadius: '50%', flexShrink: 0, background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
          {q.name.charAt(0)}
        </span>
        <span>
          <span style={{ fontWeight: 800, fontSize: '0.9em' }}>{q.name}</span>
          <span style={{ display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)' }}>{q.tag}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** Contained, swipeable strip of reviews — consistent width with the rest of the page. */
export function Testimonials() {
  return (
    <section aria-label="Відгуки користувачів" style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25em' }}>
      <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: '0 0 1.2em' }}>Що кажуть користувачі</h2>
      <ul
        tabIndex={0}
        aria-label="Відгуки — прокрутіть, щоб побачити більше"
        className="sc-foc"
        style={{
          listStyle: 'none', margin: 0, padding: '0 0 0.6em', display: 'flex', gap: '1em',
          overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        }}
      >
        {QUOTES.map((q, i) => (
          <li key={i}>
            <Card q={q} />
          </li>
        ))}
      </ul>
    </section>
  );
}
