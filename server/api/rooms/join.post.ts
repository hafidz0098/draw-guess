import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const bodySchema = z.object({
  code: z.string().min(4).max(8),
  password: z.string().max(32).optional().or(z.literal('')),
})

async function hashPassword(pw: string): Promise<string> {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pw + 'draw-guess-salt'),
  )
  return Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  const anonKey = config.public.supabaseAnonKey as string

  if (!url || !serviceKey) {
    throw createError({ statusCode: 503, message: 'Supabase service key belum di-set' })
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
    throw createError({ statusCode: 400, message: 'Kode room tidak valid' })
  }

  const code = parsed.data.code.toUpperCase().trim()
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('*')
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle()

  if (roomErr || !room) {
    throw createError({ statusCode: 404, message: 'Room tidak ditemukan' })
  }
  if (room.status === 'suspended') {
    throw createError({ statusCode: 403, message: 'Room ditangguhkan' })
  }
  if (room.password_hash) {
    const pw = parsed.data.password || ''
    if (!pw) throw createError({ statusCode: 403, message: 'Room memerlukan password' })
    const hash = await hashPassword(pw)
    if (hash !== room.password_hash) {
      throw createError({ statusCode: 403, message: 'Password salah' })
    }
  }

  const userId = userData.user.id
  const meta = userData.user.user_metadata || {}
  await admin.from('profiles').upsert({
    id: userId,
    nickname: meta.nickname || meta.full_name || `Player_${userId.slice(0, 6)}`,
    is_guest: meta.is_guest === true || String(userData.user.email || '').includes('@drawguess.local'),
  }, { onConflict: 'id' })

  // Count other connected players (exclude self for re-join)
  const { data: existingMembers } = await admin
    .from('room_members')
    .select('user_id, is_connected, role')
    .eq('room_id', room.id)

  const othersConnected = (existingMembers || []).filter(
    m => m.user_id !== userId && m.is_connected !== false && m.role !== 'spectator',
  ).length

  const alreadyIn = (existingMembers || []).find(m => m.user_id === userId)
  const role = room.host_id === userId
    ? 'host'
    : (alreadyIn?.role === 'host'
        ? 'host'
        : (othersConnected >= room.max_players && !alreadyIn ? 'spectator' : 'player'))

  const { error: memErr } = await admin.from('room_members').upsert({
    room_id: room.id,
    user_id: userId,
    role,
    is_ready: role === 'host' ? true : (alreadyIn as { is_ready?: boolean } | undefined)?.is_ready ?? false,
    is_connected: true,
    left_at: null,
  }, { onConflict: 'room_id,user_id' })

  await admin
    .from('room_members')
    .update({ is_connected: true, left_at: null, role })
    .eq('room_id', room.id)
    .eq('user_id', userId)

  if (memErr) {
    throw createError({ statusCode: 500, message: memErr.message })
  }

  const { data: members } = await admin
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', room.id)
    .order('joined_at')

  return { room, members: members || [] }
})
