import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const bodySchema = z.object({
  room_id: z.string().uuid(),
  is_ready: z.boolean(),
})

/**
 * POST /api/rooms/ready
 * Non-host players toggle ready. Host is always ready (ignored).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  const anonKey = config.public.supabaseAnonKey as string

  if (!url || !serviceKey) {
    throw createError({ statusCode: 503, message: 'Supabase not configured' })
  }

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw createError({ statusCode: 401, message: 'Login dulu' })
  }

  const userClient = createClient(url, anonKey || serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    throw createError({ statusCode: 401, message: 'Session tidak valid' })
  }

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Input invalid' })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const userId = userData.user.id
  const { room_id: roomId, is_ready: isReady } = parsed.data

  const { data: room } = await admin
    .from('rooms')
    .select('id, host_id, status')
    .eq('id', roomId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!room) {
    throw createError({ statusCode: 404, message: 'Room tidak ditemukan' })
  }

  if (room.status !== 'waiting') {
    throw createError({ statusCode: 400, message: 'Game sudah dimulai' })
  }

  // Host is always ready — no-op success
  if (room.host_id === userId) {
    return { is_ready: true, host: true }
  }

  const { data: member, error: memErr } = await admin
    .from('room_members')
    .update({ is_ready: isReady, is_connected: true, left_at: null })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select('id, is_ready, role')
    .maybeSingle()

  if (memErr) {
    throw createError({ statusCode: 500, message: memErr.message })
  }
  if (!member) {
    throw createError({ statusCode: 403, message: 'Kamu bukan anggota room ini' })
  }

  return { is_ready: member.is_ready, host: false }
})
