import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { pushStroke, clearRoomStrokes } from '../../utils/strokeBuffer'

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
  p: z.number().optional(),
})

const bodySchema = z.object({
  room_id: z.string().uuid(),
  kind: z.enum(['live', 'commit', 'clear']).default('commit'),
  round_id: z.string().optional().default('live'),
  tool: z.string().optional().default('pen'),
  color: z.string().optional().default('#000000'),
  size: z.number().optional().default(6),
  is_eraser: z.boolean().optional().default(false),
  points: z.array(pointSchema).optional().default([]),
  canvas_w: z.number().optional(),
  canvas_h: z.number().optional(),
})

/**
 * POST /api/rooms/strokes
 * Drawer relays stroke segments so guessers can poll if Realtime drops.
 * Points should be normalized 0–1 relative to drawer canvas.
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
    throw createError({ statusCode: 400, message: 'Invalid stroke payload' })
  }

  const data = parsed.data
  const userId = userData.user.id

  if (data.kind === 'clear') {
    clearRoomStrokes(data.room_id, userId)
    return { ok: true, kind: 'clear' }
  }

  if (!data.points?.length) {
    throw createError({ statusCode: 400, message: 'points required' })
  }

  // Clamp / accept raw pixels if client forgot to normalize (>1.5 → treat as px of 800)
  const points = data.points.map((p) => {
    let x = p.x
    let y = p.y
    if (x > 1.5 || y > 1.5) {
      const cw = data.canvas_w || 800
      const ch = data.canvas_h || 400
      x = x / cw
      y = y / ch
    }
    return {
      x: Math.min(1.5, Math.max(-0.1, x)),
      y: Math.min(1.5, Math.max(-0.1, y)),
      ...(p.p !== undefined ? { p: p.p } : {}),
    }
  })

  const item = pushStroke(data.room_id, userId, {
    kind: data.kind,
    round_id: data.round_id || 'live',
    tool: data.tool || 'pen',
    color: data.color || '#000000',
    size: data.size || 6,
    is_eraser: !!data.is_eraser,
    points,
    canvas_w: data.canvas_w,
    canvas_h: data.canvas_h,
  })

  return { ok: true, seq: item.seq, id: item.id }
})
