// Verifies the browser path: publishable key + RLS public-read + geo RPC.
// Run: node --env-file=apps/web/.env.local apps/web/scripts/check-client.mjs
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const { data, error } = await sb.rpc('points_near', { lng: 24.0316, lat: 49.8419, radius_m: 2500 });
const { data: cat, error: catErr } = await sb.from('accessibility_features').select('key');

console.log('rpc points_near :', error ? `ERROR ${error.message}` : `${data.length} rows`);
console.log('catalog read    :', catErr ? `ERROR ${catErr.message}` : `${cat.length} features`);
if (data?.[0]) console.log('sample          :', data[0].name, '·', Math.round(data[0].distance_m), 'm');
