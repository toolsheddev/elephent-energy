import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* Supabase Auth in the browser. Needs the project URL and the anon key, which are safe to ship to the browser:
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key from Supabase > Project Settings > API> */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = !!url && !!key
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

/** The current access token, refreshed by Supabase when it is close to expiring. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
