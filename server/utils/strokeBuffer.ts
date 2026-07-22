/**
 * In-memory stroke relay for multiplayer drawing.
 * Works for single-instance Node (local / one Nuxt server).
 * Guests poll GET /api/rooms/strokes when Realtime is flaky.
 */

export type StrokePointN = { x: number; y: number; p?: number }

export type BufferedStroke = {
  id: string
  room_id: string
  user_id: string
  /** Monotonic per room for poll cursor */
  seq: number
  kind: 'live' | 'commit' | 'clear'
  round_id: string
  tool: string
  color: string
  size: number
  is_eraser: boolean
  /** Points in normalized 0–1 canvas space */
  points: StrokePointN[]
  /** Canvas aspect used by drawer (width/height) — optional */
  canvas_w?: number
  canvas_h?: number
  created_at: number
}

type RoomBuf = {
  seq: number
  items: BufferedStroke[]
}

const buffers = new Map<string, RoomBuf>()
const MAX_ITEMS = 800
const MAX_AGE_MS = 10 * 60 * 1000

function getBuf(roomId: string): RoomBuf {
  let b = buffers.get(roomId)
  if (!b) {
    b = { seq: 0, items: [] }
    buffers.set(roomId, b)
  }
  return b
}

function prune(b: RoomBuf) {
  const cutoff = Date.now() - MAX_AGE_MS
  b.items = b.items.filter(i => i.created_at >= cutoff)
  if (b.items.length > MAX_ITEMS) {
    b.items = b.items.slice(-MAX_ITEMS)
  }
}

export function pushStroke(
  roomId: string,
  userId: string,
  payload: Omit<BufferedStroke, 'id' | 'room_id' | 'user_id' | 'seq' | 'created_at'>,
): BufferedStroke {
  const b = getBuf(roomId)
  b.seq += 1
  const item: BufferedStroke = {
    id: `${roomId}-${b.seq}`,
    room_id: roomId,
    user_id: userId,
    seq: b.seq,
    created_at: Date.now(),
    ...payload,
  }
  b.items.push(item)
  prune(b)
  return item
}

export function getStrokesAfter(roomId: string, afterSeq: number): BufferedStroke[] {
  const b = buffers.get(roomId)
  if (!b) return []
  prune(b)
  return b.items.filter(i => i.seq > afterSeq)
}

export function clearRoomStrokes(roomId: string, userId: string) {
  const b = getBuf(roomId)
  b.seq += 1
  b.items.push({
    id: `${roomId}-${b.seq}`,
    room_id: roomId,
    user_id: userId,
    seq: b.seq,
    kind: 'clear',
    round_id: 'clear',
    tool: 'pen',
    color: '#ffffff',
    size: 0,
    is_eraser: false,
    points: [],
    created_at: Date.now(),
  })
  // Drop old strokes after clear marker
  const lastClear = b.items[b.items.length - 1]
  b.items = [lastClear]
}
