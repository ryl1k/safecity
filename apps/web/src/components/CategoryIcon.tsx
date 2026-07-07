import { Store, Bus, PersonStanding, Toilet, SquareParking, type LucideIcon } from 'lucide-react';
import type { Category } from '@safecity/shared';
import { categoryColor } from '@/lib/filters';

const ICONS: Record<Category, LucideIcon> = {
  venue: Store,
  transit: Bus,
  crossing: PersonStanding,
  toilet: Toilet,
  parking: SquareParking,
};

/** Category glyph (lucide), coloured per category by default. */
export function CategoryIcon({ category, size = 18, color }: { category: Category; size?: number; color?: string }) {
  const Icon = ICONS[category];
  return <Icon size={size} color={color ?? categoryColor[category]} aria-hidden />;
}
