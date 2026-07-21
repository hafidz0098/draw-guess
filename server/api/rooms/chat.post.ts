import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const bodySchema = z.object({
  room_id: z.string().uuid(),
  message: z.string().min(1).max(200),
  message_type: z.enum(['chat', 'guess', 'system', 'correct', 'emote', 'quick']).default('chat'),
  client_id: z.string().optional(), // client-generated id for dedupe
})

/**
 * Persist + return chat message (service role).
 * Clients also broadcast via Realtime for low latency.
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
  if (!token) throw createError({ statusCode: 401, message: 'Login dulu' })

  const userClient = createClient(url, anonKey || serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    throw createError({ statusCode: 401, message: 'Session invalid' })
  }

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid chat payload' })
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const userId = userData.user.id
  const { data: profile } = await admin
    .from('profiles')
    .select('id, nickname, avatar_url, level')
    .eq('id', userId)
    .maybeSingle()

  const row: Record<string, unknown> = {
    room_id: parsed.data.room_id,
    user_id: userId,
    message: parsed.data.message.slice(0, 200),
    message_type: parsed.data.message_type,
    is_hidden: parsed.data.message_type === 'correct',
  }
  // Prefer client id so local + poll share one id (prevents duplicate bubbles)
  if (parsed.data.client_id) {
    row.id = parsed.data.client_id
  }

  const { data: inserted, error } = await admin
    .from('chat_messages')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    // Still return synthetic message so clients can sync via broadcast
    console.warn('[chat.post] insert failed', error.message)
    return {
      message: {
        id: parsed.data.client_id || crypto.randomUUID(),
        ...row,
        created_at: new Date().toISOString(),
        profile: profile || {
          id: userId,
          nickname: userData.user.user_metadata?.nickname || 'Player',
          avatar_url: null,
          level: 1,
        },
      },
      persisted: false,
    }
  }

  return {
    message: {
      ...inserted,
      profile: profile || {
        id: userId,
        nickname: 'Player',
        avatar_url: null,
        level: 1,
      },
    },
    persisted: true,
  }
})
