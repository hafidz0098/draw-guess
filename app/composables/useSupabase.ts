import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useSupabase(): SupabaseClient | null {
  if (import.meta.server) {
    // Prefer fresh client per request on server; reuse on client
  }
  if (client && import.meta.client) return client

  const config = useRuntimeConfig()
  const url = (config.public.supabaseUrl as string)?.trim()
  const key = (config.public.supabaseAnonKey as string)?.trim()

  if (!url || !key || url.includes('your-project') || key.includes('your-anon')) {
    return null
  }

  const instance = createClient(url, key, {
    auth: {
      persistSession: import.meta.client,
      autoRefreshToken: import.meta.client,
      detectSessionInUrl: import.meta.client,
    },
    realtime: {
      // Live drawing needs higher burst rate (stroke_live ~15/s + chat/game)
      params: { eventsPerSecond: 40 },
    },
  })

  if (import.meta.client) client = instance
  return instance
}

export function isSupabaseConfigured(): boolean {
  const config = useRuntimeConfig()
  const url = (config.public.supabaseUrl as string)?.trim()
  const key = (config.public.supabaseAnonKey as string)?.trim()
  return !!(url && key && !url.includes('your-project') && !key.includes('your-anon'))
}

/** Quick connectivity check (profiles table must exist) */
export async function checkSupabaseConnection(): Promise<{
  ok: boolean
  message: string
}> {
  const sb = useSupabase()
  if (!sb) {
    return { ok: false, message: 'Env Supabase belum di-set (NUXT_PUBLIC_SUPABASE_URL / ANON_KEY)' }
  }
  try {
    const { error } = await sb.from('profiles').select('id').limit(1)
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Terhubung ke Supabase' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Gagal konek' }
  }
}
