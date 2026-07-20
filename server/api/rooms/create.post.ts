import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { customAlphabet } from 'nanoid'

const bodySchema = z.object({
  name: z.string().min(2).max(40),
  password: z.string().max(32).optional().or(z.literal('')),
  is_private: z.boolean(),
  max_players: z.union([
    z.literal(2), z.literal(4), z.literal(6),
    z.literal(8), z.literal(10), z.literal(12),
  ]),
  total_rounds: z.union([
    z.literal(3), z.literal(5), z.literal(7), z.literal(10),
  ]),
  language: z.enum(['id', 'en']),
  draw_time: z.union([
    z.literal(30), z.literal(45), z.literal(60), z.literal(90),
  ]),
  word_difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
})

const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

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
    throw createError({ statusCode: 401, message: 'Login dulu (token hilang)' })
  }

  // Validate user JWT
  const userClient = createClient(url, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    throw createError({ statusCode: 401, message: 'Session tidak valid. Login ulang sebagai guest.' })
  }

  const userId = userData.user.id
  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message || 'Input tidak valid' })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Ensure profile exists
  const meta = userData.user.user_metadata || {}
  await admin.from('profiles').upsert({
    id: userId,
    nickname: meta.nickname || meta.full_name || `Player_${userId.slice(0, 6)}`,
    is_guest: meta.is_guest === true || !userData.user.email || String(userData.user.email).includes('@drawguess.local'),
  }, { onConflict: 'id' })

  const data = parsed.data
  let code = genCode()
  let password_hash: string | null = null
  if (data.password) {
    password_hash = await hashPassword(data.password)
  }

  // Retry code on unique conflict
  let room: Record<string, unknown> | null = null
  let lastError: string | null = null
  for (let i = 0; i < 5; i++) {
    const { data: roomData, error: roomErr } = await admin
      .from('rooms')
      .insert({
        code,
        name: data.name,
        password_hash,
        is_private: data.is_private,
        host_id: userId,
        max_players: data.max_players,
        total_rounds: data.total_rounds,
        language: data.language,
        draw_time: data.draw_time,
        word_difficulty: data.word_difficulty,
        status: 'waiting',
      })
      .select()
      .single()

    if (!roomErr && roomData) {
      room = roomData
      break
    }
    lastError = roomErr?.message || 'insert failed'
    if (roomErr?.code === '23505') {
      code = genCode()
      continue
    }
    break
  }

  if (!room) {
    throw createError({ statusCode: 500, message: lastError || 'Gagal insert room' })
  }

  const { error: memErr } = await admin.from('room_members').insert({
    room_id: room.id,
    user_id: userId,
    role: 'host',
    is_ready: true,
    is_connected: true,
  })

  if (memErr) {
    // rollback room
    await admin.from('rooms').delete().eq('id', room.id as string)
    throw createError({ statusCode: 500, message: memErr.message })
  }

  await admin.from('audit_logs').insert({
    user_id: userId,
    action: 'room.create',
    entity_type: 'rooms',
    entity_id: room.id,
    metadata: { code },
  }).maybeSingle()

  return { room }
})
