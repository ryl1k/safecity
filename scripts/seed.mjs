// Curated Lviv seed (KB 09). Idempotent via fixed UUIDs. Real central-Lviv coordinates.
// Run: node --env-file=.env scripts/seed.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

// id, name, category, lng, lat, address, features{key:value}
const POINTS = [
  {
    id: '11111111-1111-1111-1111-000000000001',
    name: 'Львівська ратуша', category: 'venue', lng: 24.0316, lat: 49.8419,
    address: 'пл. Ринок, 1', features: {
      step_free_entrance: 'no', ramp: 'yes', door_width: 'yes', accessible_toilet: 'no',
      tactile_guidance_entrance: 'unknown', staff_assistance: 'yes',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000002',
    name: "Кав'ярня «Світ кави»", category: 'venue', lng: 24.0301, lat: 49.8412,
    address: 'пл. Ринок, 4', features: {
      step_free_entrance: 'yes', door_width: 'yes', accessible_toilet: 'yes',
      tactile_guidance_entrance: 'no', staff_assistance: 'yes', good_lighting: 'yes',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000003',
    name: 'Аптека Д.С.', category: 'venue', lng: 24.0288, lat: 49.8405,
    address: 'пр. Свободи, 10', features: {
      step_free_entrance: 'no', ramp: 'no', door_width: 'no',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000004',
    name: 'Зупинка трамвая «Площа Ринок»', category: 'transit', lng: 24.0322, lat: 49.8425,
    address: 'пл. Ринок', features: {
      level_boarding: 'yes', step_free_to_stop: 'yes', low_floor_vehicles: 'yes',
      tactile_paving: 'yes', audio_announcements: 'no',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000005',
    name: 'Перехід на проспекті Свободи', category: 'crossing', lng: 24.0276, lat: 49.8410,
    address: 'пр. Свободи', features: {
      dropped_curb: 'yes', level_crossing: 'yes',
      tactile_paving: 'yes', acoustic_signal: 'yes',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000006',
    name: 'Громадський туалет (Підземний)', category: 'toilet', lng: 24.0299, lat: 49.8398,
    address: 'пр. Свободи', features: {
      accessible_stall: 'yes', grab_bars: 'yes', door_width: 'yes', turning_space: 'yes',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000007',
    name: 'Паркування для людей з інвалідністю', category: 'parking', lng: 24.0265, lat: 49.8431,
    address: 'вул. Дорошенка', features: {
      disabled_bay: 'yes', bay_width: 'yes', near_entrance: 'yes', firm_surface: 'yes',
    },
  },
  {
    id: '11111111-1111-1111-1111-000000000008',
    name: 'Книгарня «Є»', category: 'venue', lng: 24.0258, lat: 49.8408,
    address: 'пр. Свободи, 7', features: {}, // unknown — invites contribution
  },
];

try {
  let pts = 0;
  let fvs = 0;
  for (const p of POINTS) {
    const inserted = await sql`
      insert into points (id, name, category, geom, address, source, verify_status)
      values (${p.id}, ${p.name}, ${p.category},
              ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
              ${p.address}, 'imported', 'verified')
      on conflict (id) do nothing
      returning id`;
    if (inserted.length) pts++;
    for (const [key, value] of Object.entries(p.features)) {
      const r = await sql`
        insert into point_feature_values (point_id, feature_key, value)
        values (${p.id}, ${key}, ${value})
        on conflict (point_id, feature_key) do nothing
        returning point_id`;
      if (r.length) fvs++;
    }
  }
  const total = await sql`select count(*)::int c from points`;
  console.log(`seeded ${pts} new points, ${fvs} new feature values; points total = ${total[0].c}`);
} catch (e) {
  console.error('seed failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
