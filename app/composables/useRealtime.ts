import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DrawingStroke, ChatMessage, CursorPosition, EmoteEvent } from '~/types'
import { serializeStroke, deserializeStroke } from '~/utils/stroke'
import { useStrokeBus } from '~/utils/strokeBus'

export function useRoomRealtime(roomId: Ref<string | null | undefined>) {
  const roomStore = useRoomStore()
  const gameStore = useGameStore()
  const auth = useAuthStore()
  const router = useRouter()

  let channel: RealtimeChannel | null = null
  let unsubStroke: (() => boolean) | null = null

  function subscribe() {
    const id = unref(roomId)
    const client = useSupabase()
    if (!id || !client || !auth.user) return

    unsubscribe()

    channel = client.channel(`room:${id}`, {
      config: {
        presence: { key: auth.user.id },
        broadcast: { self: false },
      },
    })

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${id}`,
      }, () => {
        roomStore.refreshLobbyState()
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        // Always go through pushRemoteMessage (dedupe + profile enrich)
        const row = payload.new as Record<string, unknown>
        roomStore.pushRemoteMessage({
          ...row,
          room_id: row.room_id || id,
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${id}`,
      }, (payload) => {
        if (roomStore.room) {
          Object.assign(roomStore.room, payload.new)
          if ((payload.new as { status?: string }).status === 'playing') {
            const code = roomStore.room.code
            if (code && !router.currentRoute.value.path.includes('/game/')) {
              navigateTo(`/game/${code}`)
            }
          }
        }
      })

    channel.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      const { round_id, data } = payload as { round_id: string; data: unknown[][] }
      if (!data?.length) return
      gameStore.applyRemoteStrokes(data.map(d => deserializeStroke(d, round_id)))
    })

    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const c = payload as CursorPosition
      if (c.user_id === auth.user?.id) return
      gameStore.remoteCursors.set(c.user_id, c)
    })

    channel.on('broadcast', { event: 'emote' }, ({ payload }) => {
      const e = payload as EmoteEvent
      gameStore.emotes.push(e)
      setTimeout(() => {
        gameStore.emotes = gameStore.emotes.filter(x => x.timestamp !== e.timestamp)
      }, 3000)
    })

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { user_id, typing } = payload as { user_id: string; typing: boolean }
      if (typing) roomStore.typingUsers.add(user_id)
      else roomStore.typingUsers.delete(user_id)
    })

    channel.on('broadcast', { event: 'game' }, ({ payload }) => {
      handleGameEvent(
        (payload as { type: string; data: Record<string, unknown> }).type,
        (payload as { type: string; data: Record<string, unknown> }).data || {},
      )
    })

    channel.on('broadcast', { event: 'lobby_ping' }, () => {
      roomStore.refreshLobbyState()
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && auth.user && auth.profile) {
        await channel?.track({
          user_id: auth.user.id,
          nickname: auth.profile.nickname,
          avatar_url: auth.profile.avatar_url,
          online_at: new Date().toISOString(),
        })
        channel?.send({
          type: 'broadcast',
          event: 'lobby_ping',
          payload: { user_id: auth.user.id },
        })
      }
    })

    const bus = useStrokeBus()
    unsubStroke = bus.on((strokes: DrawingStroke[]) => {
      if (!channel || !strokes.length) return
      channel.send({
        type: 'broadcast',
        event: 'stroke',
        payload: {
          round_id: strokes[0].round_id,
          data: strokes.map(serializeStroke),
        },
      })
    })
  }

  function handleGameEvent(type: string, data: Record<string, unknown>) {
    switch (type) {
      case 'game_start': {
        const code = (data.code as string) || roomStore.room?.code
        if (roomStore.room) roomStore.room.status = 'playing'
        if (code && !router.currentRoute.value.path.includes('/game/')) {
          navigateTo(`/game/${code}`)
        }
        break
      }
      case 'round_start': {
        // Non-host clients: accept host's drawer assignment (do NOT set self as drawer)
        const remoteDrawer = String(data.drawerId || '')
        gameStore.applyRemoteRound({
          phase: 'selecting',
          roundNumber: Number(data.roundNumber) || 1,
          drawerId: remoteDrawer,
          wordChoices: [], // guessers never get word choices
          timeLeft: Number(data.timeLeft) || 15,
          roundId: data.roundId as string | undefined,
        })
        break
      }
      case 'word_selected': {
        // Guesser path: keep payload.drawerId, enter drawing as non-drawer
        const dId = String(data.drawerId || '')
        // Ignore if we are the drawer (we already selected locally)
        if (auth.user?.id && dId === auth.user.id) break
        gameStore.onRemoteWordSelected({
          word: String(data.word || ''),
          drawerId: dId,
          drawTime: Number(data.drawTime) || 60,
          roundId: data.roundId as string | undefined,
        })
        break
      }
      case 'stroke': {
        // strokes also go via dedicated stroke broadcast; keep for safety
        break
      }
      case 'phase': {
        if (data.phase === 'scoreboard') {
          gameStore.phase = 'scoreboard'
        } else if (data.phase === 'winner') {
          gameStore.phase = 'winner'
        } else if (data.phase === 'revealing') {
          gameStore.phase = 'revealing'
          if (data.word) gameStore.selectedWord = String(data.word)
        }
        break
      }
      default:
        break
    }
  }

  function broadcastCursor(x: number, y: number) {
    if (!channel || !auth.user || !auth.profile) return
    channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: {
        user_id: auth.user.id,
        x,
        y,
        color: auth.profile.favorite_color,
        nickname: auth.profile.nickname,
      } satisfies CursorPosition,
    })
  }

  function broadcastEmote(emoji: string) {
    if (!channel || !auth.user || !auth.profile) return
    const event: EmoteEvent = {
      user_id: auth.user.id,
      emoji,
      nickname: auth.profile.nickname,
      timestamp: Date.now(),
    }
    gameStore.pushEmote(emoji)
    channel.send({ type: 'broadcast', event: 'emote', payload: event })
  }

  function broadcastTyping(typing: boolean) {
    if (!channel || !auth.user) return
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: auth.user.id, typing },
    })
  }

  function broadcastGame(type: string, data: unknown) {
    if (!channel) {
      console.warn('[realtime] no channel for broadcast', type)
      return
    }
    channel.send({
      type: 'broadcast',
      event: 'game',
      payload: { type, data },
    })
  }

  function unsubscribe() {
    if (unsubStroke) {
      unsubStroke()
      unsubStroke = null
    }
    if (channel) {
      useSupabase()?.removeChannel(channel)
      channel = null
    }
  }

  watch(
    () => unref(roomId),
    (id) => {
      if (id) subscribe()
      else unsubscribe()
    },
    { immediate: true },
  )

  onUnmounted(unsubscribe)

  return {
    broadcastCursor,
    broadcastEmote,
    broadcastTyping,
    broadcastGame,
    unsubscribe,
  }
}
