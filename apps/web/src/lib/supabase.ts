import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Surface a clear message instead of a cryptic runtime error.
  // eslint-disable-next-line no-console
  console.warn('Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
