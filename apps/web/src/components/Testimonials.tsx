const QUOTES = [
  { name: 'Олена', tag: 'користувачка крісла', text: 'Нарешті бачу заздалегідь, чи зможу заїхати. Заощаджує стільки нервів і часу.' },
  { name: 'Андрій', tag: 'незрячий', text: 'Аудіо-список із напрямком за годинником — це саме те, чого бракувало в інших мапах.' },
  { name: 'Марія', tag: 'мама з візочком', text: 'Повідомила про відсутній пандус — і за два тижні його зробили. Працює!' },
];

/** Curated testimonials for the landing hero (static; real reviews come later). */
export function Testimonials() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
      {QUOTES.map((q) => (
        <figure
          key={q.name}
          style={{
            margin: 0,
            background: 'var(--sc-surface)',
            border: 'var(--sc-bw) solid var(--sc-border)',
            borderRadius: '1em',
            padding: '1.1em 1.2em',
            boxShadow: 'var(--sc-shadow-1)',
          }}
        >
          <blockquote style={{ margin: 0, fontSize: '0.98em', lineHeight: 1.5 }}>«{q.text}»</blockquote>
          <figcaption style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginTop: '0.8em' }}>
            <span
              aria-hidden
              style={{
                width: '2.2em', height: '2.2em', borderRadius: '50%', flexShrink: 0,
                background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)',
                display: 'grid', placeItems: 'center', fontWeight: 700,
              }}
            >
              {q.name.charAt(0)}
            </span>
            <span>
              <span style={{ fontWeight: 800, fontSize: '0.9em' }}>{q.name}</span>
              <span style={{ display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)' }}>{q.tag}</span>
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
