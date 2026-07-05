'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';

/**
 * Address input with forward-geocode autocomplete. Typing (>=3 chars) shows
 * matching places; picking one calls `onPick(lng, lat, label)` so the caller can
 * move the map pin, and sets the field to the chosen label. Free text is kept
 * verbatim when nothing is picked.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  label = 'Адреса',
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (lng: number, lat: number, label: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = `${inputId}-list`;
  // Skip the next debounced search — set right after a pick, so re-setting the
  // field to the chosen label doesn't immediately re-open the dropdown.
  const skipRef = useRef(false);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      geocodePlaces(q, 5, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(-1);
          setOpen(r.length > 0);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(p: GeoPlace) {
    skipRef.current = true;
    onChange(p.label);
    onPick(p.lng, p.lat, p.label);
    setOpen(false);
    setResults([]);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const sel = results[active];
      if (sel) pick(sel);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} style={{ minWidth: 0, position: 'relative' }}>
      <label htmlFor={inputId} style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>
        {label}
      </label>
      <input
        id={inputId}
        className="sc-foc"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        style={{
          width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: '2.75em', padding: '0 0.9em',
          borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit',
          fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)',
        }}
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{
            listStyle: 'none', margin: '0.3em 0 0', padding: '0.3em', position: 'absolute', zIndex: 20,
            left: 0, right: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border-strong)',
            borderRadius: '0.7em', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '15em', overflowY: 'auto',
          }}
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5em', padding: '0.55em 0.6em', borderRadius: '0.5em',
                cursor: 'pointer', fontSize: '0.9em', background: i === active ? 'var(--sc-surface-2)' : 'transparent',
              }}
            >
              <MapPin size={15} aria-hidden style={{ flexShrink: 0, color: 'var(--sc-muted)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
