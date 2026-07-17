'use client';

import { useRef } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

export interface PhotoWithMeta {
  file: File;
  gpsLat?: number;
  gpsLng?: number;
}

async function extractGps(file: File): Promise<{ gpsLat?: number; gpsLng?: number }> {
  try {
    const exifr = (await import('exifr')).default;
    const gps = await exifr.gps(file);
    if (gps?.latitude != null && gps?.longitude != null) {
      return { gpsLat: gps.latitude, gpsLng: gps.longitude };
    }
  } catch { /* no EXIF or not readable */ }
  return {};
}

/**
 * Photo picker with two entry points:
 *   • Camera button  — `capture="environment"` opens the rear camera on mobile,
 *                      falls back to file picker on desktop
 *   • Upload button  — standard file picker (gallery / file system)
 *
 * EXIF GPS is extracted from each photo silently; the parent receives it via
 * `PhotoWithMeta` so the submission layer can cross-check claimed location.
 */
export function PhotoInput({
  photos,
  onChange,
  max = 4,
  required = false,
}: {
  photos: PhotoWithMeta[];
  onChange: (photos: PhotoWithMeta[]) => void;
  max?: number;
  required?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const withMeta: PhotoWithMeta[] = await Promise.all(
      incoming.map(async (file) => ({ file, ...(await extractGps(file)) })),
    );
    onChange([...photos, ...withMeta].slice(0, max));
  }

  function remove(i: number) {
    onChange(photos.filter((_, idx) => idx !== i));
  }

  const canAdd = photos.length < max;
  const missing = required && photos.length === 0;

  return (
    <div>
      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => { void add(e.target.files); if (cameraRef.current) cameraRef.current.value = ''; }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { void add(e.target.files); if (galleryRef.current) galleryRef.current.value = ''; }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        aria-hidden
      />

      {/* Previews + add buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6em', alignItems: 'center' }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={URL.createObjectURL(p.file)}
              alt={`Фото ${i + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.6em', border: 'var(--sc-bw) solid var(--sc-border)' }}
            />
            {p.gpsLat != null && (
              <span
                title="GPS знайдено"
                style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 10, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 3, padding: '1px 3px', lineHeight: 1 }}
              >
                📍
              </span>
            )}
            <button
              type="button"
              aria-label={`Прибрати фото ${i + 1}`}
              className="sc-foc"
              onClick={() => remove(i)}
              style={{ position: 'absolute', top: -6, right: -6, width: '1.5em', height: '1.5em', borderRadius: '50%', border: 'none', background: 'var(--sc-bad)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}

        {canAdd && (
          <>
            {/* Camera — primary */}
            <button
              type="button"
              className="sc-foc"
              onClick={() => cameraRef.current?.click()}
              title="Зробити фото"
              style={{
                width: 72, height: 72, borderRadius: '0.6em', cursor: 'pointer',
                border: `2px solid ${missing ? 'var(--sc-bad)' : 'var(--sc-primary)'}`,
                background: missing ? 'color-mix(in srgb, var(--sc-bad) 8%, var(--sc-surface))' : 'var(--sc-primary-tint)',
                color: missing ? 'var(--sc-bad)' : 'var(--sc-primary)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25em',
              }}
              aria-label="Зробити фото"
            >
              <Camera size={22} aria-hidden />
              <span style={{ fontSize: '0.6em', fontWeight: 700, lineHeight: 1 }}>Камера</span>
            </button>

            {/* Upload — secondary */}
            <button
              type="button"
              className="sc-foc"
              onClick={() => galleryRef.current?.click()}
              title="Завантажити з галереї"
              style={{
                width: 72, height: 72, borderRadius: '0.6em', cursor: 'pointer',
                border: `2px dashed ${missing ? 'var(--sc-bad)' : 'var(--sc-border-strong)'}`,
                background: 'var(--sc-surface)',
                color: missing ? 'var(--sc-bad)' : 'var(--sc-muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25em',
              }}
              aria-label="Завантажити фото"
            >
              <ImagePlus size={20} aria-hidden />
              <span style={{ fontSize: '0.6em', fontWeight: 700, lineHeight: 1 }}>Галерея</span>
            </button>
          </>
        )}
      </div>

      {missing && (
        <p role="alert" style={{ margin: '0.4em 0 0', fontSize: '0.8em', color: 'var(--sc-bad)', fontWeight: 700 }}>
          Потрібно хоча б одне фото
        </p>
      )}
    </div>
  );
}
