import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the app has been pointed at a Supabase project. */
export const isConfigured = Boolean(url && anonKey)

// Fall back to harmless dummy values so the module can load and the app can
// render a "please configure your .env" screen instead of crashing.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
