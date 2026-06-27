/** Read-only thumbnail grid for stored photo URLs. */
export function PhotoGallery({ photos, alt = 'Фото' }: { photos: string[]; alt?: string }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6em' }}>
      {photos.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="sc-foc" style={{ display: 'block', borderRadius: '0.7em', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${alt} ${i + 1}`}
            loading="lazy"
            style={{ width: 110, height: 110, objectFit: 'cover', border: 'var(--sc-bw) solid var(--sc-border)', display: 'block' }}
          />
        </a>
      ))}
    </div>
  );
}
