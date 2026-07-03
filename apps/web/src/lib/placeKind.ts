// Fine-grained place "kind" → icon + colour. Most imported points are the coarse
// `venue` category, so we infer a sub-type from the name (cafe, pharmacy, bank,
// post, hotel, museum, shop, health, gov, park…) to give the map real variety.
import {
  BedDouble, BookOpen, Building2, Bus, Clapperboard, Coffee, Dumbbell, GraduationCap, Landmark,
  Package, Palette, PersonStanding, Pill, ShoppingBag, SquareParking, Stethoscope, Store, Toilet,
  Trees, type LucideIcon,
} from 'lucide-react';
import type { Category } from '@safecity/shared';

export const PLACE_META = {
  // venue sub-types
  cafe: { Icon: Coffee, color: '#b45309', label: 'Кафе' },
  pharmacy: { Icon: Pill, color: '#16a34a', label: 'Аптека' },
  bank: { Icon: Landmark, color: '#4338ca', label: 'Банк' },
  post: { Icon: Package, color: '#ca8a04', label: 'Пошта' },
  hotel: { Icon: BedDouble, color: '#db2777', label: 'Готель' },
  culture: { Icon: Palette, color: '#9333ea', label: 'Культура' },
  library: { Icon: BookOpen, color: '#0891b2', label: 'Бібліотека' },
  health: { Icon: Stethoscope, color: '#dc2626', label: 'Здоров’я' },
  government: { Icon: Building2, color: '#475569', label: 'Установа' },
  education: { Icon: GraduationCap, color: '#0d9488', label: 'Освіта' },
  sport: { Icon: Dumbbell, color: '#ea580c', label: 'Спорт' },
  entertainment: { Icon: Clapperboard, color: '#7c3aed', label: 'Розваги' },
  park: { Icon: Trees, color: '#15803d', label: 'Парк' },
  shop: { Icon: ShoppingBag, color: '#0284c7', label: 'Магазин' },
  place: { Icon: Store, color: '#0d5b66', label: 'Заклад' },
  // non-venue categories
  transit: { Icon: Bus, color: '#2563eb', label: 'Транспорт' },
  crossing: { Icon: PersonStanding, color: '#d97706', label: 'Перехід' },
  toilet: { Icon: Toilet, color: '#7c3aed', label: 'Туалет' },
  parking: { Icon: SquareParking, color: '#be185d', label: 'Паркування' },
} satisfies Record<string, { Icon: LucideIcon; color: string; label: string }>;

export type PlaceKind = keyof typeof PLACE_META;

// Ordered name rules (specific first) for venues.
const VENUE_RULES: [RegExp, PlaceKind][] = [
  [/кав'?ярн|кафе|\bкава\b|kredens|coffee|ресторан|піцер|\bpizza\b|\bбар\b|їдальн|бістро|пекарн|croissant|форнетті|пузата|mcdonald|kfc|salateira/, 'cafe'],
  [/аптек/, 'pharmacy'],
  [/банк|приватбанк|кредобанк|ощадбанк|укргазбанк|райффайзен|monobank|укрсиб|\bпумб\b|\bотп\b/, 'bank'],
  [/пошт|укрпошта|поштомат/, 'post'],
  [/готель|hotel|хостел|hostel|ibis|апартамент|резиденц/, 'hotel'],
  [/музей|галере|театр|філармон|jam factory|art center|культур|опера/, 'culture'],
  [/бібліотек/, 'library'],
  [/лікарн|поліклін|амбулатор|медичн|клінік|стоматолог|діагностич|центр здоров|медцентр|лабораторі/, 'health'],
  [/адміністрац|цнап|управлінн|департамент|пенсійн|соціальн|сервісн|міськрада|райрада|виконком|казначейств/, 'government'],
  [/школ|університет|ліцей|гімназ|коледж|садок|навчальн|академі|освіт/, 'education'],
  [/стадіон|спорт|фітнес|\bgym\b|тренаж|басейн|аквапарк/, 'sport'],
  [/кінотеатр|cinema|кінопалац|\bтрц\b|\bтц\b|\bmall\b|розваг|концерт|боулінг/, 'entertainment'],
  [/\bпарк|сквер|\bсад\b|бульвар|набережн/, 'park'],
  [/магазин|маркет|супермаркет|сільпо|ашан|\bshop\b|\bstore\b|епіцентр|epicentr|ринок/, 'shop'],
];

/** Resolve a point's display kind. Non-venue → its category; venue → inferred sub-type. */
export function placeKind(category: Category, name?: string): PlaceKind {
  if (category !== 'venue') return category as PlaceKind;
  const n = (name ?? '').toLowerCase().replace(/['’ʼ]/g, "'");
  for (const [re, kind] of VENUE_RULES) if (re.test(n)) return kind;
  return 'place';
}
