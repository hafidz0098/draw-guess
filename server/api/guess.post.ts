import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const schema = z.object({
  round_id: z.string().uuid(),
  user_id: z.string().uuid(),
  guess_text: z.string().min(1).max(100),
})

function normalize(text: string) {
  return text.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid input' })
  }

  const url = config.public.supabaseUrl
  const serviceKey = config.supabaseServiceKey
  if (!url || !serviceKey) {
    // Client-side validation fallback
    return { correct: false, points: 0, server: false }
  }

  const supabase = createClient(url, serviceKey)
  const { round_id, user_id, guess_text } = parsed.data

  const { data: round } = await supabase
    .from('rounds')
    .select('*, room:rooms(*)')
    .eq('id', round_id)
    .single()

  if (!round || round.status !== 'drawing') {
    throw createError({ statusCode: 400, message: 'Round not active' })
  }

  if (round.drawer_id === user_id) {
    throw createError({ statusCode: 400, message: 'Drawer cannot guess' })
  }

  const word = round.word_text as string
  const correct = normalize(guess_text) === normalize(word)

  // Rate limit: max 30 guesses per round per user
  const { count } = await supabase
    .from('guesses')
    .select('*', { count: 'exact', head: true })
    .eq('round_id', round_id)
    .eq('user_id', user_id)

  if ((count ?? 0) > 30) {
    throw createError({ statusCode: 429, message: 'Too many guesses' })
  }

  let points = 0
  let isFirst = false

  if (correct) {
    const { count: correctCount } = await supabase
      .from('guesses')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', round_id)
      .eq('is_correct', true)

    isFirst = (correctCount ?? 0) === 0
    const drawTime = round.draw_time || 60
    const started = round.drawing_started_at ? new Date(round.drawing_started_at).getTime() : Date.now()
    const elapsed = (Date.now() - started) / 1000
    const ratio = Math.max(0, 1 - elapsed / drawTime)
    points = 100 + Math.round(100 * ratio) + (isFirst ? 50 : 0)
    if (elapsed <= 5) points += 30
  }

  await supabase.from('guesses').insert({
    round_id,
    user_id,
    guess_text: correct ? '***' : guess_text.slice(0, 100),
    is_correct: correct,
    points,
    is_first: isFirst,
    time_taken_ms: round.drawing_started_at
      ? Date.now() - new Date(round.drawing_started_at).getTime()
      : null,
  })

  if (correct) {
    await supabase.from('chat_messages').insert({
      room_id: round.room_id,
      user_id,
      round_id,
      message: '✓ Benar!',
      message_type: 'correct',
      is_hidden: false,
    })

    await supabase.from('scores').insert({
      session_id: round.session_id,
      round_id,
      user_id,
      points,
      source: isFirst ? 'bonus_first' : 'guess',
    })

    await supabase.rpc('increment_member_score' as never, {
      p_room_id: round.room_id,
      p_user_id: user_id,
      p_points: points,
    } as never).maybeSingle()
  } else {
    await supabase.from('chat_messages').insert({
      room_id: round.room_id,
      user_id,
      round_id,
      message: guess_text.slice(0, 100),
      message_type: 'guess',
    })
  }

  return { correct, points, isFirst }
})
