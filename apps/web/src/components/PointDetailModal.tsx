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
import { geocodePlaces, reverseGeocode } from '@/lib/geocode';
import type { GeoPlace } from '@/lib/geocode';
import { planTransit, isTransitCovered, legLabel, fmtTime, type TransitItinerary } from '@/lib/transit';
import type { RouteDisplay } from './ExploreMap';
import { PointDetailContent } from './PointDetailContent';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

interface Step { instruction: string; distance: number }

function avoidSquare(lng: number, lat: number): number[][][] {
  const d = 0.0002;
  return [[[lng-d,lat-d],[lng+d,lat-d],[lng+d,lat+d],[lng-d,lat+d],[lng-d,lat-d]]];
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Walking route: one solid line + start/finish cues.
function walkDisplay(coords: [number, number][]): RouteDisplay {
  if (coords.length < 2) return { lines: [], markers: [] };
  const first = coords[0]!, last = coords[coords.length - 1]!;
  return {
    lines: [{ coords, color: '#1d4ed8', width: 5, opacity: 0.9, sort: 2 }],
    markers: [
      { lng: first[0], lat: first[1], kind: 'start', label: 'Старт' },
      { lng: last[0], lat: last[1], kind: 'end', label: 'Фініш' },
    ],
  };
}

// Transit routes: up to 3 itineraries in monochromatic blues (selected =
// saturated + on top, alternatives muted), walking legs dashed, and cues for
// where to board/alight each vehicle.
function transitDisplay(its: TransitItinerary[], selected: number): RouteDisplay {
  const shown = its.slice(0, 3);
  const altShades = ['#8fa8c8', '#bccadd'];
  const lines: RouteDisplay['lines'] = [];
  let alt = 0;
  shown.forEach((it, i) => {
    const sel = i === selected;
    const color = sel ? '#1d4ed8' : altShades[Math.min(alt++, altShades.length - 1)]!;
    for (const l of it.legs) {
      if (l.coords.length < 2) continue;
      lines.push({
        coords: l.coords,
        color,
        width: sel ? (l.mode === 'WALK' ? 3.5 : 5.5) : l.mode === 'WALK' ? 2 : 3,
        opacity: sel ? 0.95 : 0.5,
        dash: l.mode === 'WALK',
        sort: sel ? 2 : 1,
      });
    }
  });
  const markers: RouteDisplay['markers'] = [];
  const it = shown[selected];
  if (it) {
    const firstLeg = it.legs[0], lastLeg = it.legs[it.legs.length - 1];
    const first = firstLeg?.coords[0], last = lastLeg?.coords[lastLeg.coords.length - 1];
    if (first) markers.push({ lng: first[0], lat: first[1], kind: 'start', label: 'Старт' });
    if (last) markers.push({ lng: last[0], lat: last[1], kind: 'end', label: 'Фініш' });
    for (const l of it.legs) {
      if (l.mode === 'WALK' || l.coords.length < 2) continue;
      const b = l.coords[0]!, a = l.coords[l.coords.length - 1]!;
      markers.push({ lng: b[0], lat: b[1], kind: 'board', label: `Сісти на ${l.route ?? legLabel(l)}` });
      markers.push({ lng: a[0], lat: a[1], kind: 'alight', label: l.toName ? `Вийти: ${trunc(l.toName, 26)}` : 'Вийти' });
    }
  }
  return { lines, markers };
}

// ── Single address field with autocomplete ─────────────────────────────────
function AddressField({
  placeholder, value, onChange, onSelect, active, onActivate,
}: {
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
export function RouteTabContent({
  pointId,
  seedFrom,
  seedTo,
  onRequestMapPick,
  onCancelMapPick,
  onRouteDisplay,
}: {
  pointId?: string;
  seedFrom?: { coords: [number, number]; label: string }; // pre-fill start (e.g. from a dropped marker)
  seedTo?: { coords: [number, number]; label: string }; // pre-fill destination
  onRequestMapPick?: (cb: (lng: number, lat: number) => void) => void;
  onCancelMapPick?: () => void;
  onRouteDisplay?: (d: RouteDisplay | null) => void;
}) {
  const { primary } = useProfile();

  // FROM field
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [fromLabel, setFromLabel] = useState('');

  // Intermediate stops
  type Stop = { coords: [number, number] | null; label: string };
  const [stops, setStops] = useState<Stop[]>([]);

  // TO field — pre-filled with destination
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [toLabel, setToLabel] = useState('');

  // Which field is waiting for input; null = neither (frame removed after pick)
  // 'from' | 'to' | number (stop index)
  const [activeField, setActiveField] = useState<'from' | 'to' | number | null>(null);

  // Drag-to-reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Route result
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  // Travel mode: on-foot (ORS wheelchair) or public transport (Transitous).
  const [travelMode, setTravelMode] = useState<'walk' | 'transit'>('walk');
  const [transitIts, setTransitIts] = useState<TransitItinerary[]>([]);
  const [selectedIt, setSelectedIt] = useState(0);
  const [transitNotice, setTransitNotice] = useState<string | null>(null);
  const stepsRef = useRef<Step[]>([]);
  stepsRef.current = steps;
  const lastPlanKey = useRef<string>(''); // dedupes auto-routing against re-renders

  // Pre-fill TO: an explicit seed wins; otherwise resolve the destination point.
  useEffect(() => {
    if (seedTo) { setToCoords(seedTo.coords); setToLabel(seedTo.label); return; }
    if (!pointId) return;
    pointById(pointId).then((p) => {
      if (!p) return;
      setToCoords([p.lng, p.lat]);
      setToLabel(p.name);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointId, seedTo]);

  // Seed the start when provided (routing FROM a marker); otherwise prompt the
  // user to pick the start on the map as soon as the tab opens.
  useEffect(() => {
    if (seedFrom) { setFromCoords(seedFrom.coords); setFromLabel(seedFrom.label); return; }
    activateMapPick('from');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopSpeech(), []);

  // Clear the route display on unmount.
  useEffect(() => () => { onRouteDisplay?.(null); }, [onRouteDisplay]);

  // Auto-route when all waypoints are ready (from + all stops filled + to).
  // Dedupe by the actual waypoint set so re-renders can't fire a storm of
  // identical /route requests (which previously rate-limited ORS).
  useEffect(() => {
    if (!fromCoords || !toCoords) return;
    if (stops.some((s) => !s.coords)) return;
    const via = travelMode === 'transit' ? [] : stops.map((s) => s.coords!); // transit ignores stops
    const wps = [fromCoords, ...via, toCoords];
    const key = `${travelMode}|${primary}|${JSON.stringify(wps)}`;
    if (key === lastPlanKey.current) return;
    lastPlanKey.current = key;
    void plan(wps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCoords, toCoords, stops, primary, travelMode]);

  // Set a waypoint's coords immediately (with a coord label), then upgrade the
  // label to a real address once reverse geocoding resolves.
  function setPoint(field: 'from' | 'to' | number, lng: number, lat: number) {
    const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (field === 'from') { setFromCoords([lng, lat]); setFromLabel(coordLabel); }
    else if (field === 'to') { setToCoords([lng, lat]); setToLabel(coordLabel); }
    else setStops((prev) => prev.map((s, i) => (i === field ? { coords: [lng, lat], label: coordLabel } : s)));
    void reverseGeocode(lng, lat).then((addr) => {
      if (!addr) return;
      // Only replace the provisional coord label — never clobber a later edit/pick.
      if (field === 'from') setFromLabel((cur) => (cur === coordLabel ? addr : cur));
      else if (field === 'to') setToLabel((cur) => (cur === coordLabel ? addr : cur));
      else setStops((prev) => prev.map((s) => (s.coords && s.coords[0] === lng && s.coords[1] === lat ? { ...s, label: addr } : s)));
    });
  }

  function activateMapPick(field: 'from' | 'to' | number) {
    setActiveField(field);
    onRequestMapPick?.((lng, lat) => {
      setPoint(field, lng, lat);
      setActiveField(null);
    });
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const items = [
      { coords: fromCoords, label: fromLabel },
      ...stops.map((s) => ({ coords: s.coords, label: s.label })),
      { coords: toCoords, label: toLabel },
    ];
    const moved = items.splice(dragIdx, 1)[0];
    if (!moved) return;
    items.splice(targetIdx, 0, moved);
    const first = items[0] ?? { coords: null, label: '' };
    const last = items[items.length - 1] ?? { coords: null, label: '' };
    setFromCoords(first.coords); setFromLabel(first.label);
    setToCoords(last.coords); setToLabel(last.label);
    setStops(items.slice(1, -1));
    setActiveField(null); onCancelMapPick?.();
    setDragIdx(null); setDragOverIdx(null);
  }

  function addStop() {
    setStops((prev) => [...prev, { coords: null, label: '' }]);
    // immediately activate pick mode for the new stop
    const idx = stops.length;
    setActiveField(idx);
    onRequestMapPick?.((lng, lat) => {
      setPoint(idx, lng, lat);
      setActiveField(null);
    });
  }

  function removeStop(idx: number) {
    setStops((prev) => prev.filter((_, i) => i !== idx));
    if (activeField === idx) { setActiveField(null); onCancelMapPick?.(); }
  }

  async function plan(waypoints: [number, number][]) {
    if (waypoints.length < 2) return;
    stopSpeech(); setSpeaking(false);
    setStatus('loading'); setAvoided(0);
    const [start, end] = [waypoints[0], waypoints[waypoints.length - 1]];
    const via = waypoints.slice(1, -1);

    if (travelMode === 'transit') {
      setTransitNotice(null);
      setSteps([]); setSummary(null); setFallback(false);
      // Transit coverage is Lviv-only for now.
      if (!isTransitCovered(start!, end!)) {
        setTransitIts([]);
        onRouteDisplay?.(null);
        setTransitNotice('Маршрути громадським транспортом наразі доступні лише у Львові.');
        setStatus('ready');
        return;
      }
      try {
        const its = await planTransit(start!, end!);
        setTransitIts(its);
        setSelectedIt(0);
        onRouteDisplay?.(its.length ? transitDisplay(its, 0) : null);
        setStatus(its.length ? 'ready' : 'error');
      } catch { setStatus('error'); }
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      if (apiEnabled) {
        try {
          data = await api.post('/route', { from: start, to: end, via, profile: primary }, { auth: false });
        } catch { setStatus('error'); return; }
      } else {
        const allLng = waypoints.map((p) => p[0]);
        const allLat = waypoints.map((p) => p[1]);
        const box = { minLng: Math.min(...allLng) - 0.003, minLat: Math.min(...allLat) - 0.003, maxLng: Math.max(...allLng) + 0.003, maxLat: Math.max(...allLat) + 0.003 };
        let avoid: number[][][][] = [];
        try {
          const probs = await problemsInBbox(box.minLng, box.minLat, box.maxLng, box.maxLat);
          avoid = probs.filter((p) => p.status === 'confirmed' || p.status === 'escalated').map((p) => avoidSquare(p.lng, p.lat));
        } catch { /* best-effort */ }
        const res = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: start, to: end, via, profile: primary, avoid }) });
        if (!res.ok) { setStatus('error'); return; }
        data = await res.json();
      }
      onRouteDisplay?.(walkDisplay(data.coordinates ?? []));
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

      {/* Travel mode: on foot vs public transport */}
      <div role="radiogroup" aria-label="Спосіб пересування" style={{ display: 'flex', gap: '0.4em' }}>
        {([['walk', 'Пішки'], ['transit', 'Транспортом']] as const).map(([m, label]) => (
          <button
            key={m} type="button" role="radio" aria-checked={travelMode === m} className="sc-foc"
            onClick={() => setTravelMode(m)}
            style={{
              flex: 1, minHeight: '2.5em', borderRadius: '0.7em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em',
              border: `var(--sc-bw) solid ${travelMode === m ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
              background: travelMode === m ? 'var(--sc-primary)' : 'var(--sc-surface)',
              color: travelMode === m ? 'var(--sc-on-primary)' : 'var(--sc-text)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Map pick hint — only shown when a field is active */}
      {activeField !== null && (
        <p style={{ margin: 0, fontSize: '0.82em', color: 'var(--sc-primary)', fontWeight: 600 }}>
          📍 {activeField === 'from' ? 'Клікніть на мапі, щоб вибрати початок'
            : activeField === 'to' ? 'Клікніть на мапі, щоб вибрати кінець'
            : `Клікніть на мапі, щоб вибрати зупинку ${Number(activeField) + 1}`}
        </p>
      )}

      {/* Unified draggable waypoint list */}
      {(() => {
        const allItems = [
          { coords: fromCoords, label: fromLabel },
          ...stops.map((s) => ({ coords: s.coords, label: s.label })),
          { coords: toCoords, label: toLabel },
        ];
        const lastI = allItems.length - 1;
        return allItems.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === lastI;
          const stopIdx = isFirst || isLast ? -1 : i - 1;
          const fieldId: 'from' | 'to' | number = isFirst ? 'from' : isLast ? 'to' : stopIdx;
          const dot = isFirst
            ? <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2.5px solid var(--sc-muted)', display: 'inline-block', flexShrink: 0 }} />
            : isLast
            ? <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--sc-bad)', display: 'inline-block', flexShrink: 0 }} />
            : <span style={{ width: 12, height: 12, borderRadius: '3px', border: '2.5px solid var(--sc-muted)', display: 'inline-block', flexShrink: 0 }} />;
          return (
            <div key={i}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
              onDragLeave={() => setDragOverIdx((prev) => (prev === i ? null : prev))}
              onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4em', opacity: dragIdx === i ? 0.4 : 1, transition: 'opacity 0.15s', borderTop: dragOverIdx === i && dragIdx !== null && dragIdx !== i ? '2px solid var(--sc-primary)' : '2px solid transparent' }}
            >
              <span draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                style={{ cursor: 'grab', flexShrink: 0, display: 'grid', placeItems: 'center', padding: '0.25em', touchAction: 'none' }}
                aria-label="Перетягнути">
                {dot}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AddressField
                  placeholder={isFirst ? 'Звідки…' : isLast ? 'Куди…' : `Зупинка ${stopIdx + 1}…`}
                  value={item.label}
                  onChange={(v) => {
                    if (isFirst) setFromLabel(v);
                    else if (isLast) setToLabel(v);
                    else setStops((prev) => prev.map((s, si) => si === stopIdx ? { ...s, label: v } : s));
                  }}
                  onSelect={(coords, label) => {
                    if (isFirst) { setFromCoords(coords); setFromLabel(label); }
                    else if (isLast) { setToCoords(coords); setToLabel(label); }
                    else setStops((prev) => prev.map((s, si) => si === stopIdx ? { coords, label } : s));
                    setActiveField(null); onCancelMapPick?.();
                  }}
                  active={activeField === fieldId}
                  onActivate={() => activateMapPick(fieldId)}
                />
              </div>
              {!isFirst && !isLast && (
                <button type="button" onClick={() => removeStop(stopIdx)} aria-label="Видалити зупинку"
                  style={{ flexShrink: 0, width: '2em', height: '2em', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--sc-muted)', fontSize: '1.2em', display: 'grid', placeItems: 'center' }}>
                  ×
                </button>
              )}
            </div>
          );
        });
      })()}

      {/* Add stop button (walking mode only — transit plans A→B) */}
      {travelMode === 'walk' && (
        <button type="button" onClick={addStop}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5em', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sc-primary)', fontFamily: 'inherit', fontSize: '0.88em', fontWeight: 700, padding: '0.1em 0', alignSelf: 'flex-start' }}>
          <span style={{ width: '1.4em', height: '1.4em', borderRadius: '50%', border: '2px solid var(--sc-primary)', display: 'grid', placeItems: 'center', fontSize: '1em', lineHeight: 1 }}>+</span>
          Додати зупинку
        </button>
      )}

      {/* Route result */}
      {status === 'loading' && <LoadingState label="Прокладання маршруту" />}
      {status === 'error' && fromCoords && toCoords && !stops.some((s) => !s.coords) && (
        <ErrorState
          title={travelMode === 'transit' ? 'Маршрутів транспортом не знайдено' : 'Не вдалося прокласти маршрут'}
          onRetry={() => { lastPlanKey.current = ''; void plan([fromCoords, ...stops.map((s) => s.coords!), toCoords]); }}
        />
      )}

      {status === 'ready' && travelMode === 'transit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
          {transitNotice && (
            <p role="status" style={{ margin: 0, padding: '0.6em 0.85em', borderRadius: '0.7em', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)', fontSize: '0.85em', fontWeight: 700 }}>
              {transitNotice}
            </p>
          )}
          {transitIts.slice(0, 3).map((it, i) => {
            const active = i === selectedIt;
            const transitLegs = it.legs.filter((l) => l.mode !== 'WALK');
            return (
              <button
                key={i} type="button" className="sc-foc"
                onClick={() => { setSelectedIt(i); onRouteDisplay?.(transitDisplay(transitIts, i)); }}
                aria-pressed={active}
                style={{
                  textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: '0.7em 0.9em', borderRadius: '0.8em',
                  border: `var(--sc-bw) solid ${active ? 'var(--sc-primary)' : 'var(--sc-border)'}`,
                  background: active ? 'var(--sc-primary-tint)' : 'var(--sc-surface)', color: 'var(--sc-text)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95em' }}>{it.durationMin} хв</strong>
                  <span style={{ color: 'var(--sc-muted)', fontSize: '0.82em' }}>
                    {fmtTime(it.startTime)}–{fmtTime(it.endTime)} · {it.transfers === 0 ? 'без пересадок' : `${it.transfers} перес.`}
                  </span>
                  {it.access === 'yes' ? (
                    <span style={{ marginLeft: 'auto', fontSize: '0.75em', fontWeight: 800, color: 'var(--sc-ok)' }}>♿ доступний</span>
                  ) : it.access === 'no' ? (
                    <span style={{ marginLeft: 'auto', fontSize: '0.75em', fontWeight: 800, color: 'var(--sc-warn)' }}>частково недоступний</span>
                  ) : (
                    <span style={{ marginLeft: 'auto', fontSize: '0.75em', fontWeight: 700, color: 'var(--sc-muted)' }}>доступність невідома</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.35em', flexWrap: 'wrap', marginTop: '0.45em' }}>
                  {transitLegs.map((l, j) => (
                    <span key={j} style={{
                      fontSize: '0.8em', fontWeight: 800, padding: '0.15em 0.5em', borderRadius: '0.5em',
                      background: l.accessible === 'yes' ? 'var(--sc-ok)' : l.accessible === 'no' ? 'var(--sc-bad)' : 'var(--sc-surface-2, #e5e7eb)',
                      color: l.accessible === 'unknown' ? 'var(--sc-text)' : '#fff',
                      border: l.accessible === 'unknown' ? 'var(--sc-bw) solid var(--sc-border-strong)' : 'none',
                    }}>
                      {legLabel(l)}{l.accessible === 'no' ? ' ✕' : l.accessible === 'yes' ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                {active && (
                  <ol style={{ listStyle: 'none', margin: '0.55em 0 0', padding: 0 }}>
                    {it.legs.map((l, j) => (
                      <li key={j} style={{ display: 'flex', gap: '0.5em', padding: '0.25em 0', fontSize: '0.85em' }}>
                        <span style={{ color: 'var(--sc-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(l.startTime)}</span>
                        <span style={{ minWidth: 0 }}>
                          {l.mode === 'WALK'
                            ? 'Пішки'
                            : `Сядьте на ${legLabel(l).toLowerCase()} на «${l.fromName}» → вийдіть на «${l.toName}»`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </button>
            );
          })}
          {transitIts.length > 0 && (
            <p style={{ margin: 0, fontSize: '0.72em', color: 'var(--sc-muted)' }}>
              ✓ — підтверджено низькопідлоговий транспорт; сірий — немає даних про доступність. Дані: міський GTFS + Transitous.
            </p>
          )}
        </div>
      )}

      {status === 'ready' && travelMode === 'walk' && (
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
  onRouteDisplay,
}: {
  id: string;
  onClose: () => void;
  onRequestMapPick?: (cb: (lng: number, lat: number) => void) => void;
  onCancelMapPick?: () => void;
  onRouteDisplay?: (d: RouteDisplay | null) => void;
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
        {tab === 'route' && <RouteTabContent pointId={id} onRequestMapPick={onRequestMapPick} onCancelMapPick={onCancelMapPick} onRouteDisplay={onRouteDisplay} />}
      </div>
    </div>
  );
}
