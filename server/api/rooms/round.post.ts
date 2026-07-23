import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const bodySchema = z.object({
  room_id: z.string().uuid(),
  phase: z.enum(['selecting', 'drawing', 'revealing', 'scoreboard', 'winner']),
  round_number: z.number().int().min(1),
  drawer_id: z.string().nullable(),
  selected_word: z.string().nullable(),
  timer_ends_at: z.number().nullable(),
})

/**
 * POST /api/rooms/round
 * Persist a lightweight snapshot of the in-progress round to rooms.settings
 * so a page refresh can resume the round instead of restarting it.
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

  const { data: member } = await admin
    .from('room_members')
    .select('id')
    .eq('room_id', parsed.data.room_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!member) {
    throw createError({ statusCode: 403, message: 'Kamu bukan anggota room ini' })
  }

  const { data: room } = await admin
    .from('rooms')
    .select('settings')
    .eq('id', parsed.data.room_id)
    .maybeSingle()

  const settings = (room?.settings as Record<string, unknown>) || {}
  const round = {
    phase: parsed.data.phase,
    roundNumber: parsed.data.round_number,
    drawerId: parsed.data.drawer_id,
    selectedWord: parsed.data.selected_word,
    timerEndsAt: parsed.data.timer_ends_at,
    updatedAt: Date.now(),
  }

  await admin
    .from('rooms')
    .update({ settings: { ...settings, round } })
    .eq('id', parsed.data.room_id)

  return { ok: true }
})
