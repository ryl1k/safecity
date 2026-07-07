'use client';

import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

/** Pick + preview up to `max` photos (kept as File[]; uploaded on submit by the parent). */
export function PhotoInput({ files, onChange, max = 4 }: { files: File[]; onChange: (files: File[]) => void; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'));
    onChange([...files, ...incoming].slice(0, max));
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(i: number) {
    onChange(files.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => add(e.target.files)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        id="photo-input"
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6em', alignItems: 'center' }}>
        {files.map((f, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt={`Фото ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.6em', border: 'var(--sc-bw) solid var(--sc-border)' }} />
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
        {files.length < max && (
          <button
            type="button"
            className="sc-foc"
            onClick={() => inputRef.current?.click()}
            style={{ width: 72, height: 72, borderRadius: '0.6em', border: '2px dashed var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            aria-label="Додати фото"
          >
            <ImagePlus size={20} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
