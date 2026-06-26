import type { CSSProperties } from 'react';
import { rating, categoryShape, type RatingKey, type CategoryKey } from '@safecity/design-tokens';

const categoryLabel: Record<CategoryKey, string> = {
  venue: 'Заклад',
  transit: 'Транспорт',
  crossing: 'Перехід',
  toilet: 'Туалет',
  parking: 'Паркування',
};

// Shape-specific CSS (category = shape). Diamond rotates; pentagon/hexagon use clip-path.
function shapeStyle(category: CategoryKey): CSSProperties {
  switch (categoryShape[category]) {
    case 'square':
      return { borderRadius: '0.45em' };
    case 'diamond':
      return { transform: 'rotate(45deg)' };
    case 'pentagon':
      return { clipPath: 'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)' };
    case 'hexagon':
      return { clipPath: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)' };
    case 'circle':
    default:
      return { borderRadius: '50%' };
  }
}

export interface MapPinProps {
  category: CategoryKey;
  rating: RatingKey;
  size?: number; // em
}

export function MapPin({ category, rating: r, size = 2.4 }: MapPinProps) {
  const meta = rating[r];
  const isDiamond = categoryShape[category] === 'diamond';
  const base: CSSProperties = {
    width: `${size}em`,
    height: `${size}em`,
    background: `var(--sc-${meta.key})`,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    border: '2px solid #fff',
    boxShadow: 'var(--sc-shadow-2)',
    ...shapeStyle(category),
  };
  return (
    <span
      role="img"
      aria-label={`${categoryLabel[category]} — ${meta.label}`}
      style={base}
    >
      <span aria-hidden style={isDiamond ? { transform: 'rotate(-45deg)' } : undefined}>
        {meta.icon}
      </span>
    </span>
  );
}

export function PinLegend() {
  const cats = Object.keys(categoryShape) as CategoryKey[];
  const ratings = Object.keys(rating) as RatingKey[];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.4em' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.8em', color: 'var(--sc-muted)', marginBottom: '0.8em' }}>
          Категорія = форма
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.1em' }}>
          {cats.map((c) => (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4em', width: '4em' }}>
              <MapPin category={c} rating="full" />
              <span style={{ fontSize: '0.72em', fontWeight: 600, textAlign: 'center' }}>{categoryLabel[c]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderLeft: 'var(--sc-bw) solid var(--sc-border)', paddingLeft: '1.4em' }}>
        <div style={{ fontWeight: 600, fontSize: '0.8em', color: 'var(--sc-muted)', marginBottom: '0.8em' }}>
          Рейтинг = колір + іконка
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
          {ratings.map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
              <span
                aria-hidden
                style={{
                  width: '1.8em', height: '1.8em', borderRadius: '50%',
                  background: `var(--sc-${rating[r].key})`, color: '#fff',
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.85em',
                }}
              >
                {rating[r].icon}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.9em' }}>{rating[r].label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
