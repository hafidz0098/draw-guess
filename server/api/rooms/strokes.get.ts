import { getStrokesAfter } from '../../utils/strokeBuffer'

/**
 * GET /api/rooms/strokes?room_id=...&after=0
 * Poll stroke buffer for guessers (Realtime fallback).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const roomId = String(query.room_id || '').trim()
  const after = Math.max(0, Number(query.after) || 0)

  if (!roomId) {
    throw createError({ statusCode: 400, message: 'room_id required' })
  }

  const strokes = getStrokesAfter(roomId, after)
  const lastSeq = strokes.length ? strokes[strokes.length - 1].seq : after

  return {
    strokes,
    last_seq: lastSeq,
  }
})
