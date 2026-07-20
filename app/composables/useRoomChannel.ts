import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DrawingStroke } from '~/types'
import { serializeStroke, deserializeStroke } from '~/utils/stroke'

type AnyHandler = (...args: never[]) => void

const channels = new Map<string, RealtimeChannel>()
const subscribed = new Map<string, boolean>()
const strokeHandlers = new Map<string, Set<(strokes: DrawingStroke[]) => void>>()
const gameHandlers = new Map<string, Set<(type: string, data: Record<string, unknown>) => void>>()
const chatHandlers = new Map<string, Set<(msg: Record<string, unknown>) => void>>()

function handlersFor<T extends AnyHandler>(map: Map<string, Set<T>>, id: string): Set<T> {
  if (!map.has(id)) map.set(id, new Set())
  return map.get(id)!
}

/**
 * Shared realtime channel per roomId.
 * Safe to call from multiple components.
 */
export function useRoomChannel(roomId: Ref<string | null | undefined>) {
  const auth = useAuthStore()

  function getId(): string | null {
    const id = unref(roomId)
    return id || null
  }

  function ensureChannel(id: string): RealtimeChannel | null {
    const client = useSupabase()
    if (!client) {
      console.warn('[channel] no supabase client')
      return null
    }
    // Allow subscribe even without auth.user for anon if needed
    if (channels.has(id)) return channels.get(id)!

    const key = auth.user?.id || `anon-${Math.random().toString(36).slice(2)}`
    const ch = client.channel(`dg-room:${id}`, {
      config: {
        presence: { key },
        broadcast: { ack: false, self: false },
      },
    })

    ch.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      try {
        const { round_id, data } = payload as { round_id: string; data: unknown[][] }
        if (!data?.length) return
        const strokes = data.map(d => deserializeStroke(d, round_id))
        handlersFor(strokeHandlers, id).forEach(fn => fn(strokes))
      } catch (e) {
        console.warn('[channel] stroke parse', e)
      }
    })

    ch.on('broadcast', { event: 'stroke_live' }, ({ payload }) => {
      try {
        const p = payload as {
          round_id: string
          color: string
          size: number
          tool: string
          is_eraser: boolean
          points: { x: number; y: number }[]
          seq: number
        }
        if (!p.points?.length) return
        const stroke: DrawingStroke = {
          round_id: p.round_id || 'live',
          sequence: -Math.abs(p.seq || Date.now()),
          tool: (p.tool as DrawingStroke['tool']) || 'pen',
          color: p.color || '#000000',
          size: p.size || 6,
          opacity: 1,
          points: p.points,
          is_eraser: !!p.is_eraser,
          timestamp_ms: Date.now(),
          shape_data: { live: true },
        }
        handlersFor(strokeHandlers, id).forEach(fn => fn([stroke]))
      } catch (e) {
        console.warn('[channel] live parse', e)
      }
    })

    ch.on('broadcast', { event: 'canvas_clear' }, () => {
      handlersFor(strokeHandlers, id).forEach(fn => fn([{
        round_id: 'clear',
        sequence: -1,
        tool: 'pen',
        color: '#ffffff',
        size: 0,
        opacity: 1,
        points: [],
        is_eraser: false,
        timestamp_ms: Date.now(),
        shape_data: { clear: true },
      }]))
    })

    ch.on('broadcast', { event: 'game' }, ({ payload }) => {
      const { type, data } = (payload || {}) as { type: string; data: Record<string, unknown> }
      if (!type) return
      handlersFor(gameHandlers, id).forEach(fn => fn(type, data || {}))
    })

    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      console.log('[channel] chat received', payload)
      handlersFor(chatHandlers, id).forEach(fn => fn((payload || {}) as Record<string, unknown>))
    })

    channels.set(id, ch)
    subscribed.set(id, false)

    ch.subscribe((status) => {
      console.log('[channel] status', id.slice(0, 8), status)
      subscribed.set(id, status === 'SUBSCRIBED')
    })

    return ch
  }

  async function waitSubscribed(id: string, ms = 3000): Promise<boolean> {
    const ch = ensureChannel(id)
    if (!ch) return false
    if (subscribed.get(id)) return true
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (subscribed.get(id)) return true
      await new Promise(r => setTimeout(r, 50))
    }
    return !!subscribed.get(id)
  }

  function onStrokes(fn: (strokes: DrawingStroke[]) => void) {
    let currentId: string | null = null
    const attach = (id: string) => {
      ensureChannel(id)
      handlersFor(strokeHandlers, id).add(fn)
      currentId = id
    }
    const stop = watch(() => unref(roomId), (id) => {
      if (currentId) handlersFor(strokeHandlers, currentId).delete(fn)
      if (id) attach(id)
    }, { immediate: true })
    return () => {
      stop()
      if (currentId) handlersFor(strokeHandlers, currentId).delete(fn)
    }
  }

  function onGame(fn: (type: string, data: Record<string, unknown>) => void) {
    let currentId: string | null = null
    const attach = (id: string) => {
      ensureChannel(id)
      handlersFor(gameHandlers, id).add(fn)
      currentId = id
    }
    const stop = watch(() => unref(roomId), (id) => {
      if (currentId) handlersFor(gameHandlers, currentId).delete(fn)
      if (id) attach(id)
    }, { immediate: true })
    return () => {
      stop()
      if (currentId) handlersFor(gameHandlers, currentId).delete(fn)
    }
  }

  function onChat(fn: (msg: Record<string, unknown>) => void) {
    let currentId: string | null = null
    const attach = (id: string) => {
      ensureChannel(id)
      handlersFor(chatHandlers, id).add(fn)
      currentId = id
      console.log('[channel] chat handler attached', id.slice(0, 8), 'count', handlersFor(chatHandlers, id).size)
    }
    const stop = watch(() => unref(roomId), (id) => {
      if (currentId) handlersFor(chatHandlers, currentId).delete(fn)
      if (id) attach(id)
    }, { immediate: true })
    return () => {
      stop()
      if (currentId) handlersFor(chatHandlers, currentId).delete(fn)
    }
  }

  async function sendStrokes(strokes: DrawingStroke[]) {
    const id = getId()
    if (!id || !strokes.length) return
    await waitSubscribed(id)
    const ch = ensureChannel(id)
    ch?.send({
      type: 'broadcast',
      event: 'stroke',
      payload: {
        round_id: strokes[0].round_id,
        data: strokes.map(serializeStroke),
      },
    })
  }

  async function sendLiveStroke(payload: {
    round_id: string
    color: string
    size: number
    tool: string
    is_eraser: boolean
    points: { x: number; y: number }[]
    seq: number
  }) {
    const id = getId()
    if (!id) return
    const ch = ensureChannel(id)
    // don't wait every frame — fire and forget if subscribed
    if (!subscribed.get(id)) await waitSubscribed(id, 1000)
    ch?.send({ type: 'broadcast', event: 'stroke_live', payload })
  }

  async function sendClear() {
    const id = getId()
    if (!id) return
    await waitSubscribed(id)
    ensureChannel(id)?.send({ type: 'broadcast', event: 'canvas_clear', payload: {} })
  }

  async function sendGame(type: string, data: unknown) {
    const id = getId()
    if (!id) {
      console.warn('[channel] sendGame no room id', type)
      return
    }
    await waitSubscribed(id)
    const ch = ensureChannel(id)
    const res = ch?.send({
      type: 'broadcast',
      event: 'game',
      payload: { type, data },
    })
    console.log('[channel] sendGame', type, res)
  }

  async function sendChat(msg: Record<string, unknown>) {
    const id = getId()
    if (!id) {
      console.warn('[channel] sendChat no room id', msg)
      return false
    }
    const ok = await waitSubscribed(id, 4000)
    if (!ok) console.warn('[channel] sendChat not subscribed yet, trying anyway')
    const ch = ensureChannel(id)
    if (!ch) return false
    const res = await ch.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg,
    })
    console.log('[channel] sendChat', msg.message, res)
    return true
  }

  // Eager connect
  watch(() => unref(roomId), (id) => {
    if (id) ensureChannel(id)
  }, { immediate: true })

  return {
    onStrokes,
    onGame,
    onChat,
    sendStrokes,
    sendLiveStroke,
    sendClear,
    sendGame,
    sendChat,
    waitSubscribed: () => {
      const id = getId()
      return id ? waitSubscribed(id) : Promise.resolve(false)
    },
    channelStatus: () => {
      const id = getId()
      if (!id) return 'no-room'
      return subscribed.get(id) ? 'SUBSCRIBED' : (channels.has(id) ? 'CONNECTING' : 'none')
    },
  }
}
