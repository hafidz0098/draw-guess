import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/rooms/state?code=ABC123
 * Returns room + members + active session (service role — bypasses RLS).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  const anonKey = config.public.supabaseAnonKey as string

  if (!url || !serviceKey) {
    throw createError({ statusCode: 503, message: 'Supabase not configured' })
  }

  const query = getQuery(event)
  const code = String(query.code || '').toUpperCase().trim()
  const roomId = String(query.room_id || '').trim()

  if (!code && !roomId) {
    throw createError({ statusCode: 400, message: 'code or room_id required' })
  }

  // Optional auth — not strictly required for lobby view of public/waiting rooms
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (token && anonKey) {
    const userClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await userClient.auth.getUser(token) // validates token if present
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let roomQuery = admin.from('rooms').select('*').is('deleted_at', null)
  if (roomId) roomQuery = roomQuery.eq('id', roomId)
  else roomQuery = roomQuery.eq('code', code)

  const { data: room, error: roomErr } = await roomQuery.maybeSingle()
  if (roomErr || !room) {
    throw createError({ statusCode: 404, message: 'Room tidak ditemukan' })
  }

  const { data: members } = await admin
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true })

  const { data: session } = await admin
    .from('game_sessions')
    .select('*')
    .eq('room_id', room.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    room,
    members: members || [],
    session: session || null,
  }
})
