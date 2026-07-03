import type { Category } from '@safecity/shared';
import { PLACE_META, placeKind } from '@/lib/placeKind';

/** Sub-type-aware place glyph (cafe/pharmacy/bank/… for venues, else category). */
export function PlaceIcon({
  category,
  name,
  size = 18,
  color,
}: {
  category: Category;
  name?: string;
  size?: number;
  color?: string;
}) {
  const meta = PLACE_META[placeKind(category, name)];
  const Icon = meta.Icon;
  return <Icon size={size} color={color ?? meta.color} aria-hidden />;
}
