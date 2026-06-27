const QUOTES = [
  { name: 'Олена', tag: 'користувачка крісла', text: 'Нарешті бачу заздалегідь, чи зможу заїхати. Заощаджує стільки нервів і часу.' },
  { name: 'Андрій', tag: 'незрячий', text: 'Аудіо-список із напрямком — саме те, чого бракувало в інших мапах.' },
  { name: 'Марія', tag: 'мама з візочком', text: 'Повідомила про відсутній пандус — і за два тижні його зробили. Працює!' },
  { name: 'Ігор', tag: 'на милицях', text: 'Маршрути без сходів економлять мені сили щодня.' },
  { name: 'Софія', tag: 'волонтерка', text: 'Додавати місця легко — і це реально допомагає людям навколо.' },
];

function Card({ q, hidden }: { q: (typeof QUOTES)[number]; hidden?: boolean }) {
  return (
    <figure
      aria-hidden={hidden}
      style={{
        margin: 0, width: 320, flexShrink: 0, marginRight: '1em',
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

/** Continuously looping strip of reviews (pauses on hover; stops at reduced-motion). */
export function Testimonials() {
  return (
    <div className="sc-marquee" role="region" aria-label="Відгуки користувачів">
      <div className="sc-marquee-track" style={{ padding: '0.3em 0' }}>
        {QUOTES.map((q, i) => <Card key={`a${i}`} q={q} />)}
        {QUOTES.map((q, i) => <Card key={`b${i}`} q={q} hidden />)}
      </div>
    </div>
  );
}
