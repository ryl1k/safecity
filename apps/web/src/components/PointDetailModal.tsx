'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { pointById } from '@/lib/points';
import { problemsInBbox } from '@/lib/civic';
import { api, apiEnabled } from '@/lib/api';
import { distanceLabel } from '@/lib/format';
import { speak, stopSpeech } from '@/lib/tts';
import { geocodePlaces } from '@/lib/geocode';
import type { GeoPlace } from '@/lib/geocode';
import { PointDetailContent } from './PointDetailContent';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

interface Step { instruction: string; distance: number }

function avoidSquare(lng: number, lat: number): number[][][] {
  const d = 0.0002;
  return [[[lng-d,lat-d],[lng+d,lat-d],[lng+d,lat+d],[lng-d,lat+d],[lng-d,lat-d]]];
}

// ── Single address field with autocomplete ─────────────────────────────────
function AddressField({
  icon, placeholder, value, onChange, onSelect, active, onActivate,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (coords: [number, number], label: string) => void;
  active: boolean;
  onActivate: () => void;
}) {
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only search when this field is actively focused by the user — not on
    // programmatic pre-fills from the parent (e.g. destination pre-loaded from point data).
    if (!active || value.length < 3) { setResults([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    geocodePlaces(value, 5, ctrl.signal)
      .then(setResults).catch(() => {}).finally(() => setSearching(false));
    return () => ctrl.abort();
  }, [value, active]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6em',
        padding: '0.55em 0.8em',
        borderRadius: '0.7em',
        border: `2px solid ${active ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
        boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--sc-primary) 20%, transparent)' : 'none',
        background: 'var(--sc-surface)',
        cursor: 'text',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }} onClick={onActivate}>
        <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>{icon}</span>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); onActivate(); }}
          onFocus={onActivate}
          placeholder={placeholder}
          style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '0.9em', color: 'var(--sc-text)', outline: 'none', minWidth: 0 }}
        />
        {searching && <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em', flexShrink: 0 }}>…</span>}
      </div>
      {results.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '0.2em 0 0', padding: 0, listStyle: 'none', background: 'var(--sc-surface)', border: '1.5px solid var(--sc-border-strong)', borderRadius: '0.7em', boxShadow: '0 4px 16px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect([r.lng, r.lat], r.label); setResults([]); }}
                style={{ width: '100%', textAlign: 'left', padding: '0.6em 0.9em', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88em', color: 'var(--sc-text)', borderBottom: '1px solid var(--sc-border)' }}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Route tab content ──────────────────────────────────────────────────────
function RouteTabContent({
  pointId,
  onRequestMapPick,
  onCancelMapPick,
  onRouteLine,
}: {
  pointId: string;
  onRequestMapPick?: (cb: (lng: number, lat: number) => void) => void;
  onCancelMapPick?: () => void;
  onRouteLine?: (coords: [number, number][]) => void;
}) {
  const { primary } = useProfile();

  // FROM field
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [fromLabel, setFromLabel] = useState('');

  // TO field — pre-filled with destination
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [toLabel, setToLabel] = useState('');

  // Which field is waiting for input; null = neither (frame removed after pick)
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);

  // Route result
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const stepsRef = useRef<Step[]>([]);
  stepsRef.current = steps;

  // Pre-fill TO from destination point
  useEffect(() => {
    pointById(pointId).then((p) => {
      if (!p) return;
      setToCoords([p.lng, p.lat]);
      setToLabel(p.name);
    }).catch(() => {});
  }, [pointId]);

  // Activate map pick for FROM as soon as tab opens
  useEffect(() => {
    activateMapPick('from');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopSpeech(), []);

  // Push route line to parent map; clear on unmount.
  useEffect(() => { onRouteLine?.(line); }, [line, onRouteLine]);
  useEffect(() => () => { onRouteLine?.([]); }, [onRouteLine]);

  // Auto-route when both coords are ready
  useEffect(() => {
    if (fromCoords && toCoords) void plan(fromCoords, toCoords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCoords, toCoords, primary]);

  function activateMapPick(field: 'from' | 'to') {
    setActiveField(field);
    onRequestMapPick?.((lng, lat) => {
      const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (field === 'from') { setFromCoords([lng, lat]); setFromLabel(label); }
      else { setToCoords([lng, lat]); setToLabel(label); }
      setActiveField(null); // remove frame once pick is done
    });
  }

  async function plan(start: [number, number], end: [number, number]) {
    stopSpeech(); setSpeaking(false);
    setStatus('loading'); setAvoided(0);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      if (apiEnabled) {
        try {
          data = await api.post('/route', { from: start, to: end, profile: primary }, { auth: false });
        } catch { setStatus('error'); return; }
      } else {
        const box = {
          minLng: Math.min(start[0], end[0]) - 0.003, minLat: Math.min(start[1], end[1]) - 0.003,
          maxLng: Math.max(start[0], end[0]) + 0.003, maxLat: Math.max(start[1], end[1]) + 0.003,
        };
        let avoid: number[][][][] = [];
        try {
          const probs = await problemsInBbox(box.minLng, box.minLat, box.maxLng, box.maxLat);
          avoid = probs.filter((p) => p.status === 'confirmed' || p.status === 'escalated').map((p) => avoidSquare(p.lng, p.lat));
        } catch { /* best-effort */ }
        const res = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: start, to: end, profile: primary, avoid }) });
        if (!res.ok) { setStatus('error'); return; }
        data = await res.json();
      }
      setLine(data.coordinates ?? []);
      setSteps(data.steps ?? []);
      setSummary(data.summary ?? null);
      setFallback(Boolean(data.fallback));
      setAvoided(data.avoided ?? 0);
      setStatus('ready');
    } catch { setStatus('error'); }
  }

  function toggleSpeak() {
    if (speaking) { stopSpeech(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(stepsRef.current.map((s) => s.instruction).join('. '), { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7em' }}>

      {/* Map pick hint — only shown when a field is active */}
      {activeField && (
        <p style={{ margin: 0, fontSize: '0.82em', color: 'var(--sc-primary)', fontWeight: 600 }}>
          📍 {activeField === 'from' ? 'Клікніть на мапі, щоб вибрати початок' : 'Клікніть на мапі, щоб вибрати кінець'}
        </p>
      )}

      {/* FROM field */}
      <AddressField
        icon={<span style={{ width: 12, height: 12, borderRadius: '50%', border: '2.5px solid var(--sc-muted)', display: 'inline-block' }} />}
        placeholder="Звідки…"
        value={fromLabel}
        onChange={setFromLabel}
        onSelect={(coords, label) => { setFromCoords(coords); setFromLabel(label); setActiveField(null); onCancelMapPick?.(); }}
        active={activeField === 'from'}
        onActivate={() => activateMapPick('from')}
      />

      {/* Divider with swap hint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em', padding: '0 0.4em' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--sc-border)' }} />
        <span style={{ fontSize: '0.75em', color: 'var(--sc-muted)' }}>↕</span>
        <div style={{ flex: 1, height: 1, background: 'var(--sc-border)' }} />
      </div>

      {/* TO field */}
      <AddressField
        icon={<span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--sc-bad)', display: 'inline-block' }} />}
        placeholder="Куди…"
        value={toLabel}
        onChange={setToLabel}
        onSelect={(coords, label) => { setToCoords(coords); setToLabel(label); setActiveField(null); onCancelMapPick?.(); }}
        active={activeField === 'to'}
        onActivate={() => activateMapPick('to')}
      />

      {/* Route result */}
      {status === 'loading' && <LoadingState label="Прокладання маршруту" />}
      {status === 'error' && fromCoords && toCoords && (
        <ErrorState title="Не вдалося прокласти маршрут" onRetry={() => void plan(fromCoords, toCoords)} />
      )}

      {status === 'ready' && (
        <>
          {fallback && (
            <p role="status" style={{ margin: 0, padding: '0.55em 0.8em', borderRadius: '0.7em', background: 'var(--sc-warn-bg)', color: 'var(--sc-warn)', border: 'var(--sc-bw) solid var(--sc-warn-line)', fontSize: '0.82em', fontWeight: 700 }}>
              Пішохідний маршрут — даних для крісла колісного бракує.
            </p>
          )}
          {avoided > 0 && (
            <p role="status" style={{ margin: 0, padding: '0.55em 0.8em', borderRadius: '0.7em', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)', fontSize: '0.82em', fontWeight: 700 }}>
              Оминаємо {avoided} бар'єр(и) на шляху.
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
            {summary && <span style={{ fontWeight: 800, fontSize: '0.95em' }}>{distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв</span>}
            <Button variant={speaking ? 'secondary' : 'accent'} onClick={toggleSpeak} style={{ marginLeft: 'auto', minHeight: '2.2em', fontSize: '0.85em' }}>
              {speaking ? 'Зупинити' : 'Озвучити'}
            </Button>
          </div>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em', overflow: 'hidden' }}>
            {steps.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: '0.6em', padding: '0.6em 0.8em', borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                <span aria-hidden style={{ width: '1.5em', height: '1.5em', flexShrink: 0, borderRadius: '50%', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.75em' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.88em' }}>{s.instruction}</span>
                <span style={{ color: 'var(--sc-muted)', fontSize: '0.78em', whiteSpace: 'nowrap', flexShrink: 0 }}>{distanceLabel(s.distance)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ── Main modal / side-panel ────────────────────────────────────────────────
export function PointDetailModal({
  id,
  onClose,
  onRequestMapPick,
  onCancelMapPick,
  onRouteLine,
}: {
  id: string;
  onClose: () => void;
  onRequestMapPick?: (cb: (lng: number, lat: number) => void) => void;
  onCancelMapPick?: () => void;
  onRouteLine?: (coords: [number, number][]) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'info' | 'route'>('info');

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prevActive?.focus?.(); };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Деталі місця"
      style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: 'min(420px, 100vw)', zIndex: 60, background: 'var(--sc-bg)', boxShadow: '4px 0 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflowY: 'auto', borderRight: 'var(--sc-bw) solid var(--sc-border)' }}
    >
      {/* Tab bar + close */}
      <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--sc-bg)', borderBottom: 'var(--sc-bw) solid var(--sc-border)', display: 'flex', alignItems: 'center' }}>
        {(['info', 'route'] as const).map((t) => (
          <button key={t} type="button" className="sc-foc" onClick={() => setTab(t)}
            style={{ flex: 1, minHeight: '2.8em', border: 'none', borderBottom: `3px solid ${tab === t ? 'var(--sc-primary)' : 'transparent'}`, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.92em', color: tab === t ? 'var(--sc-primary)' : 'var(--sc-muted)' }}>
            {t === 'info' ? 'Інформація' : 'Маршрут'}
          </button>
        ))}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Закрити" className="sc-foc"
          style={{ flexShrink: 0, margin: '0 0.5em', width: '2.2em', height: '2.2em', borderRadius: '50%', cursor: 'pointer', border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)', color: 'var(--sc-text)', display: 'grid', placeItems: 'center' }}>
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Tab content */}
      <div style={{ padding: '1.2em 1.4em 2.5em' }}>
        {tab === 'info' && <PointDetailContent id={id} onRouteClick={() => setTab('route')} />}
        {tab === 'route' && <RouteTabContent pointId={id} onRequestMapPick={onRequestMapPick} onCancelMapPick={onCancelMapPick} onRouteLine={onRouteLine} />}
      </div>
    </div>
  );
}
