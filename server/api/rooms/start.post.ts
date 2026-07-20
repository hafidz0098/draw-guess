import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const bodySchema = z.object({
  room_id: z.string().uuid(),
})

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
    throw createError({ statusCode: 401, message: 'Session tidak valid — login guest ulang' })
  }

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'room_id invalid' })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const userId = userData.user.id
  const roomId = parsed.data.room_id

  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .is('deleted_at', null)
    .maybeSingle()

  if (roomErr || !room) {
    throw createError({ statusCode: 404, message: 'Room tidak ditemukan' })
  }

  const { data: myMembership } = await admin
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()

  const isHost = room.host_id === userId || myMembership?.role === 'host'
  if (!isHost) {
    throw createError({
      statusCode: 403,
      message: 'Hanya host yang bisa start.',
    })
  }

  if (room.host_id !== userId) {
    await admin.from('rooms').update({ host_id: userId }).eq('id', roomId)
  }

  // Mark caller connected
  await admin
    .from('room_members')
    .update({ is_connected: true, left_at: null })
    .eq('room_id', roomId)
    .eq('user_id', userId)

  const { data: members } = await admin
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })

  const players = (members || []).filter(
    m => m.role !== 'spectator' && m.is_connected !== false,
  )

  // Allow 1 player (solo practice) — multiplayer works with 2+
  if (players.length < 1) {
    throw createError({
      statusCode: 400,
      message: 'Tidak ada pemain di room. Join ulang.',
    })
  }

  if (room.status === 'playing') {
    const { data: existing } = await admin
      .from('game_sessions')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      room,
      session: existing,
      members: members || [],
      already_started: true,
    }
  }

  await admin
    .from('game_sessions')
    .update({ status: 'cancelled', ended_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('status', 'active')

  const { data: session, error: sessErr } = await admin
    .from('game_sessions')
    .insert({
      room_id: roomId,
      status: 'active',
      total_rounds: room.total_rounds,
    })
    .select()
    .single()

  if (sessErr || !session) {
    throw createError({ statusCode: 500, message: sessErr?.message || 'Gagal buat session' })
  }

  const { data: updatedRoom, error: upErr } = await admin
    .from('rooms')
    .update({ status: 'playing', current_round: 1, host_id: userId })
    .eq('id', roomId)
    .select()
    .single()

  if (upErr) {
    throw createError({ statusCode: 500, message: upErr.message })
  }

  await admin.from('room_members').update({ score: 0 }).eq('room_id', roomId)

  const { data: fullMembers } = await admin
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true })

  return {
    room: updatedRoom,
    session,
    members: fullMembers || [],
    already_started: false,
  }
})
