import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Surface a clear message instead of a cryptic runtime error.
  // eslint-disable-next-line no-console
  console.warn('Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

// Fall back to a syntactically-valid placeholder when env is absent so
// createClient never throws at module load. This keeps `next build` from
// crashing while prerendering pages (e.g. /admin) in environments without the
// public env (CI/Docker with empty build args). A real deploy always sets the
// NEXT_PUBLIC_* values, which are inlined into the client bundle at build time.
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});
