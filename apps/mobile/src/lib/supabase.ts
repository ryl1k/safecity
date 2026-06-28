// Supabase client for React Native: AsyncStorage session persistence + URL
// polyfill (RN lacks a global URL). Placeholder fallbacks keep imports from
// throwing before env is configured (real values come from .env).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL } from './env';

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // no URL-based auth callbacks in RN
    },
  },
);
