'use client';

import { X, Route } from 'lucide-react';
import type { StreetSegment } from '@/lib/segments';

const UNKNOWN_RATING = { label: 'Невідомо', color: '#374151', bg: '#f3f4f6' };
const RATING_META: Record<string, { label: string; color: string; bg: string }> = {
  full:    { label: 'Повністю доступна', color: '#166534', bg: '#dcfce7' },
  partial: { label: 'Частково доступна', color: '#92400e', bg: '#fef3c7' },
  none:    { label: 'Недоступна',        color: '#991b1b', bg: '#fee2e2' },
  unknown: UNKNOWN_RATING,
};

// Every surface the importer can store maps to a Ukrainian label — no raw OSM
// value (like "sett") ever reaches the panel. Grouped by how they rate.
const SURFACE_LABELS: Record<string, string> = {
  // good — can reach "full"
  asphalt: 'Асфальт', concrete: 'Бетон', 'concrete:plates': 'Бетонні плити',
  paving_stones: 'Тротуарна плитка', paved: 'Тверде покриття',
  wood: 'Дерев’яний настил', metal: 'Металевий настил',
  // poor — capped at "partial"
  sett: 'Брукований камінь', 'concrete:lanes': 'Бетонні смуги',
  compacted: 'Ущільнений ґрунт', fine_gravel: 'Дрібний гравій',
  // impassable — forces "none"
  cobblestone: 'Кругляк (бруківка)', unhewn_cobblestone: 'Необроблений камінь',
  pebblestone: 'Галька', gravel: 'Гравій', sand: 'Пісок', ground: 'Ґрунт',
  dirt: 'Земля', earth: 'Земля', grass: 'Трава', mud: 'Багно',
  unpaved: 'Без твердого покриття', rock: 'Скельна порода',
  unknown: 'Невідомо',
};

const SMOOTHNESS_LABELS: Record<string, string> = {
  excellent: 'Відмінна', good: 'Добра', intermediate: 'Задовільна',
  bad: 'Погана', very_bad: 'Дуже погана', horrible: 'Жахлива',
  very_horrible: 'Вкрай жахлива', impassable: 'Непрохідна',
};

const SOURCE_LABELS: Record<string, string> = {
  osm: 'OpenStreetMap',
  gov: 'держмоніторинг безбар’єрності',
  dem: 'рельєф (DEM)',
  user: 'спільнота',
};

// Honest provenance line built from which sources actually filled this segment's
// fields — OSM geometry/surface, gov «Мапа безбар'єрності» criteria, DEM incline.
function sourceLabel(fieldSources: Record<string, string> | null | undefined): string {
  const present = new Set(Object.values(fieldSources ?? {}));
  const parts = ['osm', 'gov', 'dem', 'user'].filter((s) => present.has(s)).map((s) => SOURCE_LABELS[s]);
  return parts.length ? `дані: ${parts.join(', ')}` : 'дані OpenStreetMap';
}

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3em',
      fontSize: '0.82em', fontWeight: 700, padding: '0.25em 0.65em',
      borderRadius: '1em',
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#166534' : '#991b1b',
    }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

function AttrRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null) return null;
  return (
    <>
      <span style={{ color: 'var(--sc-muted)', fontSize: '0.88em' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: '0.88em' }}>{value}</span>
    </>
  );
}

export function StreetSegmentPanel({
  segment,
  onClose,
}: {
  segment: StreetSegment;
  onClose: () => void;
}) {
  const rating = RATING_META[segment.rating] ?? UNKNOWN_RATING;

  return (
    <div role="dialog" aria-label={`Деталі вулиці: ${segment.streetName}`} style={panel}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5em', marginBottom: '0.75em' }}>
        <Route size={18} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0, marginTop: '0.15em' }} />
        <strong style={{ flex: 1, minWidth: 0, fontSize: '1.1em', lineHeight: 1.3 }}>
          {segment.streetName}
        </strong>
        <button type="button" className="sc-foc" aria-label="Закрити" onClick={onClose} style={closeBtn}>
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Accessibility rating badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginBottom: '1.1em', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.88em', fontWeight: 800, padding: '0.3em 0.9em',
          borderRadius: '1em', background: rating.bg, color: rating.color,
        }}>
          {rating.label}
        </span>
        {segment.verifyStatus === 'verified' ? (
          <span style={{ fontSize: '0.78em', color: '#166534', fontWeight: 700 }}>✓ Верифіковано</span>
        ) : (
          <span style={{ fontSize: '0.78em', color: 'var(--sc-muted)', fontWeight: 600 }}>
            Не верифіковано · {sourceLabel(segment.fieldSources)}
          </span>
        )}
      </div>

      {/* Physical attributes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.45em 1em', alignItems: 'center', marginBottom: '1em' }}>
        <AttrRow
          label="Ширина тротуару"
          value={segment.sidewalkWidthM != null ? `${segment.sidewalkWidthM} м` : null}
        />
        <AttrRow
          label="Покриття"
          value={segment.surfaceType ? (SURFACE_LABELS[segment.surfaceType] ?? segment.surfaceType) : null}
        />
        <AttrRow
          label="Рівність покриття"
          value={segment.smoothness ? (SMOOTHNESS_LABELS[segment.smoothness] ?? segment.smoothness) : null}
        />
        <AttrRow
          label="Нахил"
          value={segment.inclinePercent != null ? `${segment.inclinePercent}%` : null}
        />
      </div>

      {/* Boolean features as pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em' }}>
        <Pill ok={segment.isStepFree}       label="Без сходинок" />
        <Pill ok={segment.hasTactilePaving} label="Тактильне покриття" />
        <Pill ok={segment.hasCurbCuts}      label="Знижений бордюр" />
        <Pill ok={segment.hasRamp}          label="Пандус" />
        <Pill ok={segment.lit}              label="Освітлення" />
      </div>
    </div>
  );
}

const panel = {
  position: 'absolute' as const, top: 0, left: 0, height: '100%', width: 'min(420px, 100vw)',
  zIndex: 55, background: 'var(--sc-bg)', boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
  overflowY: 'auto' as const, borderRight: 'var(--sc-bw) solid var(--sc-border)',
  padding: '1.2em 1.4em 2.5em',
} as const;

const closeBtn = {
  flexShrink: 0, width: '2.2em', height: '2.2em', borderRadius: '50%', cursor: 'pointer',
  border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)',
  color: 'var(--sc-text)', display: 'grid', placeItems: 'center',
} as const;
