import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/rooms/chat?room_id=...&since=ISO
 * Poll fallback when Realtime chat fails.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string

  if (!url || !serviceKey) {
    throw createError({ statusCode: 503, message: 'Supabase not configured' })
  }

  const q = getQuery(event)
  const roomId = String(q.room_id || '')
  if (!roomId) throw createError({ statusCode: 400, message: 'room_id required' })

  const since = q.since ? String(q.since) : null
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let query = admin
    .from('chat_messages')
    .select('*, profile:profiles(id, nickname, avatar_url, level)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (since) {
    query = query.gt('created_at', since)
  }

  const { data, error } = await query
  if (error) throw createError({ statusCode: 500, message: error.message })

  return { messages: data || [] }
})
