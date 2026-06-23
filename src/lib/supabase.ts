import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseAnonKey = publicAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession:      true,
    autoRefreshToken:    true,
    detectSessionInUrl:  true,
  },
  global: {
    headers: {
      // Prevent Supabase JS from sending session-level parameters
      // that PgBouncer transaction-mode pooler doesn't support
      'x-connection-encrypted': 'true',
    },
  },
});