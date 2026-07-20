import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { customAlphabet } from 'nanoid'

const bodySchema = z.object({
  nickname: z.string().min(2).max(20).optional(),
})

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)
const passNano = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#', 24)

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  const anonKey = config.public.supabaseAnonKey as string

  if (!url || !serviceKey || !anonKey) {
    throw createError({ statusCode: 503, message: 'Supabase belum dikonfigurasi (service key / URL)' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = bodySchema.safeParse(body || {})
  const nickname = parsed.success && parsed.data.nickname
    ? parsed.data.nickname
    : `Guest_${nano().slice(0, 4)}`

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Use a synthetic but valid-looking email (no inbox needed; confirmed via admin API)
  const email = `guest_${nano()}@users.drawguess.app`
  const password = passNano()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nickname,
      is_guest: true,
      full_name: nickname,
    },
  })

  if (createErr || !created.user) {
    throw createError({
      statusCode: 500,
      message: createErr?.message || 'Gagal membuat guest user',
    })
  }

  // Ensure profile row exists (trigger may already create it)
  await admin.from('profiles').upsert({
    id: created.user.id,
    nickname,
    is_guest: true,
  }, { onConflict: 'id' })

  // Sign in with anon client to get a real session JWT for the browser
  const publicClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: sessionData, error: signErr } = await publicClient.auth.signInWithPassword({
    email,
    password,
  })

  if (signErr || !sessionData.session) {
    throw createError({
      statusCode: 500,
      message: signErr?.message || 'Gagal membuat session guest',
    })
  }

  return {
    user: {
      id: created.user.id,
      email,
    },
    session: {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      expires_at: sessionData.session.expires_at,
      token_type: sessionData.session.token_type,
    },
    nickname,
  }
})
