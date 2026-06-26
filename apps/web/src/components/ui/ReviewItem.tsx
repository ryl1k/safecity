import type { CSSProperties } from 'react';

export interface ReviewItemProps {
  author: string;
  /** e.g. "користувачка крісла" / "незряча користувачка" */
  profileTag?: string;
  timeAgo: string;
  text: string;
}

export function ReviewItem({ author, profileTag, timeAgo, text }: ReviewItemProps) {
  const avatar: CSSProperties = {
    width: '2.4em', height: '2.4em', borderRadius: '50%',
    background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)',
    display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0,
  };
  return (
    <div style={{ display: 'flex', gap: '0.7em' }}>
      <span aria-hidden style={avatar}>
        {author.charAt(0)}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92em' }}>{author}</span>
          {profileTag ? (
            <span
              style={{
                fontSize: '0.72em', fontWeight: 800, color: 'var(--sc-ok)',
                background: 'var(--sc-ok-bg)', borderRadius: '1em', padding: '0.1em 0.55em',
              }}
            >
              {profileTag}
            </span>
          ) : null}
          <span style={{ fontSize: '0.74em', color: 'var(--sc-muted)', marginLeft: 'auto' }}>{timeAgo}</span>
        </div>
        <p style={{ margin: '0.4em 0 0', fontSize: '0.88em', lineHeight: 1.45 }}>{text}</p>
      </div>
    </div>
  );
}
