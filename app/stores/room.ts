import { defineStore } from 'pinia'
import type { Room, RoomMember, ChatMessage, CreateRoomInput, GameSession, Round } from '~/types'
import { generateRoomCode } from '~/utils/room'
import { createRoomSchema, joinRoomSchema } from '~/utils/validation'

function isMemberActive(m: RoomMember): boolean {
  // Treat as connected unless explicitly offline
  if (m.is_connected === false) return false
  if ((m as RoomMember & { left_at?: string | null }).left_at) return false
  return true
}

export const useRoomStore = defineStore('room', () => {
  const room = ref<Room | null>(null)
  const members = ref<RoomMember[]>([])
  const messages = ref<ChatMessage[]>([])
  const session = ref<GameSession | null>(null)
  const currentRound = ref<Round | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const typingUsers = ref<Set<string>>(new Set())
  const lastSyncAt = ref<number>(0)
  const syncError = ref<string | null>(null)

  const auth = useAuthStore()

  /** Strict: only rooms.host_id is host (never trust role alone) */
  const isHost = computed(() => {
    if (!room.value?.host_id || !auth.user?.id) return false
    return room.value.host_id === auth.user.id
  })

  const myMember = computed(() => members.value.find(m => m.user_id === auth.user?.id))
  const isSpectator = computed(() => myMember.value?.role === 'spectator')

  const activeMembers = computed(() => members.value.filter(isMemberActive))

  const connectedPlayers = computed(() =>
    activeMembers.value.filter(m => m.role !== 'spectator'),
  )

  function isRoomHostMember(m: RoomMember): boolean {
    return !!room.value?.host_id && m.user_id === room.value.host_id
  }

  /** Min 2 players; host counts ready; every other connected player must is_ready */
  const allReady = computed(() => {
    const players = connectedPlayers.value
    if (players.length < 2) return false
    return players.every(m => isRoomHostMember(m) || !!m.is_ready)
  })

  const notReadyCount = computed(() =>
    connectedPlayers.value.filter(m => !isRoomHostMember(m) && !m.is_ready).length,
  )

  const sortedByScore = computed(() =>
    [...members.value].sort((a, b) => b.score - a.score),
  )

  function reset() {
    room.value = null
    members.value = []
    messages.value = []
    session.value = null
    currentRound.value = null
    error.value = null
    syncError.value = null
    typingUsers.value = new Set()
  }

  /** Clear chat + session when switching rooms (keep no leftover UI state) */
  function clearRoomScopedState() {
    messages.value = []
    session.value = null
    currentRound.value = null
    typingUsers.value = new Set()
    error.value = null
    syncError.value = null
  }

  async function createRoom(input: CreateRoomInput) {
    loading.value = true
    error.value = null
    // Drop old room chat/session before creating new one
    clearRoomScopedState()
    members.value = []
    room.value = null

    try {
      const parsed = createRoomSchema.parse(input)
      await auth.ensureSupabaseUser(auth.profile?.nickname)
      if (!auth.user || !auth.profile) throw new Error('Login dulu')

      const token = await auth.getAccessToken()
      if (!token || !auth.hasSupabaseSession) {
        throw new Error('Session Supabase gagal. Refresh halaman lalu coba lagi.')
      }

      const res = await $fetch<{ room: Room }>('/api/rooms/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          name: parsed.name,
          password: parsed.password || '',
          is_private: parsed.is_private,
          max_players: parsed.max_players,
          total_rounds: parsed.total_rounds,
          language: parsed.language,
          draw_time: parsed.draw_time,
          word_difficulty: parsed.word_difficulty,
          word_category: parsed.word_category || null,
        },
      })

      // Ensure chat still empty for brand-new room
      messages.value = []
      room.value = res.room
      await refreshLobbyState()
      // Never pull old messages after create
      messages.value = []

      if (!members.value.length) {
        members.value = [{
          id: crypto.randomUUID(),
          room_id: res.room.id,
          user_id: auth.user.id,
          role: 'host',
          is_ready: true,
          is_connected: true,
          score: 0,
          ping: 0,
          joined_at: new Date().toISOString(),
          profile: auth.profile,
        }]
      }
      persistLocal()
      return res.room
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message
        || (e instanceof Error ? e.message : 'Gagal membuat room')
      error.value = msg
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  async function joinRoom(code: string, password?: string) {
    loading.value = true
    error.value = null
    try {
      const parsed = joinRoomSchema.parse({ code, password })
      await auth.ensureSupabaseUser(auth.profile?.nickname)
      if (!auth.user || !auth.profile) throw new Error('Login dulu')

      const token = await auth.getAccessToken()
      if (!token || !auth.hasSupabaseSession) {
        throw new Error('Session Supabase gagal. Refresh & login guest lagi.')
      }

      // Switching room → wipe previous chat first
      const prevCode = room.value?.code
      if (!prevCode || prevCode !== parsed.code) {
        clearRoomScopedState()
        members.value = []
      }

      const res = await $fetch<{ room: Room; members: RoomMember[] }>('/api/rooms/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { code: parsed.code, password: password || '' },
      })

      // If room id changed, force empty chat then load only this room's messages
      if (room.value?.id && room.value.id !== res.room.id) {
        messages.value = []
      }
      room.value = res.room
      members.value = normalizeMembers(res.members || [])
      messages.value = [] // clear before fetch so no bleed
      await refreshLobbyState()
      await fetchMessages()
      // Filter: only keep messages for this room id
      messages.value = messages.value.filter(m => m.room_id === res.room.id)
      persistLocal()
      return res.room
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message
        || (e instanceof Error ? e.message : 'Gagal join room')
      error.value = msg
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  function normalizeMembers(list: RoomMember[]): RoomMember[] {
    return list.map(m => ({
      ...m,
      is_connected: m.is_connected !== false,
      score: m.score ?? 0,
      // flatten profile if nested oddly
      profile: m.profile || undefined,
    }))
  }

  async function fetchMembers() {
    await refreshLobbyState()
  }

  async function refreshLobbyState() {
    if (!room.value && !import.meta.client) return
    const code = room.value?.code
    const roomId = room.value?.id
    if (!code && !roomId) return

    try {
      const token = await auth.getAccessToken()
      const qs = code
        ? `code=${encodeURIComponent(code)}`
        : `room_id=${encodeURIComponent(roomId!)}`

      const res = await $fetch<{
        room: Room
        members: RoomMember[]
        session: GameSession | null
      }>(`/api/rooms/state?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.room) {
        room.value = { ...(room.value || {} as Room), ...res.room }
      }
      if (Array.isArray(res.members)) {
        members.value = normalizeMembers(res.members)
      }
      if (res.session) {
        session.value = res.session
      }
      lastSyncAt.value = Date.now()
      syncError.value = null
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message
        || (e instanceof Error ? e.message : 'Sync gagal')
      syncError.value = msg
      console.warn('[room] refreshLobbyState failed', msg)
    }
  }

  async function fetchMessages() {
    if (!room.value?.id) {
      messages.value = []
      return
    }
    const roomId = room.value.id
    const client = useSupabase()
    if (!client) {
      // Keep only in-memory messages for this room
      messages.value = messages.value.filter(m => m.room_id === roomId)
      return
    }
    try {
      const { data } = await client
        .from('chat_messages')
        .select('*, profile:profiles(id, nickname, avatar_url, level)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100)
      // Replace entirely — never merge with previous room
      messages.value = ((data || []) as ChatMessage[]).filter(m => m.room_id === roomId)
    } catch {
      messages.value = messages.value.filter(m => m.room_id === roomId)
    }
  }

  async function toggleReady() {
    if (!myMember.value || !room.value) return
    // Host is always ready — no toggle
    if (isHost.value) return

    const next = !myMember.value.is_ready
    // Optimistic UI
    myMember.value.is_ready = next

    try {
      const token = await auth.getAccessToken()
      if (token && auth.hasSupabaseSession) {
        await $fetch('/api/rooms/ready', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: { room_id: room.value.id, is_ready: next },
        })
      } else {
        const client = useSupabase()
        if (client) {
          await client.from('room_members').update({ is_ready: next }).eq('id', myMember.value.id)
        }
      }
    } catch (e) {
      // Revert optimistic update
      myMember.value.is_ready = !next
      console.warn('[room] toggleReady failed', e)
      throw e
    }
    await refreshLobbyState()
  }

  async function leaveRoom() {
    if (!room.value || !auth.user) return
    const token = await auth.getAccessToken()
    try {
      if (token) {
        // best-effort: mark offline via supabase client
        const client = useSupabase()
        if (client) {
          await client
            .from('room_members')
            .update({ is_connected: false, left_at: new Date().toISOString() })
            .eq('room_id', room.value.id)
            .eq('user_id', auth.user.id)
        }
      }
    } catch { /* ignore */ }
    reset()
  }

  async function kickPlayer(userId: string) {
    if (!isHost.value || !room.value) return
    const client = useSupabase()
    if (client) {
      await client.from('room_members').delete().eq('room_id', room.value.id).eq('user_id', userId)
    }
    members.value = members.value.filter(m => m.user_id !== userId)
    await refreshLobbyState()
  }

  async function transferHost(userId: string) {
    if (!isHost.value || !room.value || !auth.user) return
    const client = useSupabase()
    if (client) {
      await client.from('rooms').update({ host_id: userId }).eq('id', room.value.id)
      await client.from('room_members').update({ role: 'player' }).eq('room_id', room.value.id).eq('user_id', auth.user.id)
      await client.from('room_members').update({ role: 'host' }).eq('room_id', room.value.id).eq('user_id', userId)
    }
    await refreshLobbyState()
  }

  function resolveProfile(
    userId: string,
    profileRaw?: ChatMessage['profile'] | null,
  ): ChatMessage['profile'] {
    const nick = profileRaw?.nickname?.trim()
    if (nick) {
      return {
        id: profileRaw!.id || userId,
        nickname: nick,
        avatar_url: profileRaw!.avatar_url ?? null,
        level: profileRaw!.level ?? 1,
      }
    }
    // Enrich from room members / self
    const member = members.value.find(m => m.user_id === userId)
    if (member?.profile?.nickname) {
      return {
        id: member.profile.id || userId,
        nickname: member.profile.nickname,
        avatar_url: member.profile.avatar_url ?? null,
        level: member.profile.level ?? 1,
      }
    }
    if (auth.user?.id === userId && auth.profile?.nickname) {
      return {
        id: auth.profile.id,
        nickname: auth.profile.nickname,
        avatar_url: auth.profile.avatar_url ?? null,
        level: auth.profile.level ?? 1,
      }
    }
    return {
      id: userId,
      nickname: userId ? `Player_${userId.slice(0, 4)}` : 'Player',
      avatar_url: null,
      level: 1,
    }
  }

  async function sendChat(
    message: string,
    messageType: ChatMessage['message_type'] = 'chat',
  ): Promise<ChatMessage | null> {
    if (!room.value || !auth.user || !auth.profile) return null
    const clientId = crypto.randomUUID()
    const msg: ChatMessage = {
      id: clientId,
      room_id: room.value.id,
      user_id: auth.user.id,
      round_id: currentRound.value?.id ?? null,
      message,
      message_type: messageType,
      is_hidden: messageType === 'correct',
      mentions: [],
      created_at: new Date().toISOString(),
      profile: {
        id: auth.profile.id,
        nickname: auth.profile.nickname,
        avatar_url: auth.profile.avatar_url,
        level: auth.profile.level,
      },
    }
    messages.value.push(msg)

    // Persist via server API (service role) — avoids RLS + returns profile
    // Do NOT also insert via client (would create a 2nd row → duplicate ": msg")
    try {
      const token = await auth.getAccessToken()
      if (token && auth.hasSupabaseSession) {
        const res = await $fetch<{ message: ChatMessage; persisted?: boolean }>('/api/rooms/chat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: {
            room_id: room.value.id,
            message,
            message_type: messageType,
            client_id: clientId,
          },
        })
        if (res.message?.id) {
          // Align local id with server so poll/realtime/postgres dedupe works
          const idx = messages.value.findIndex(m => m.id === clientId)
          if (idx >= 0) {
            messages.value[idx] = {
              ...messages.value[idx],
              id: res.message.id,
              created_at: res.message.created_at || messages.value[idx].created_at,
              profile: resolveProfile(auth.user.id, res.message.profile || msg.profile),
            }
            return messages.value[idx]
          }
        }
      }
    } catch (e) {
      console.warn('[room] sendChat server failed', e)
    }
    return (
      messages.value.find(m => m.id === clientId)
      || messages.value.find(m => m.user_id === auth.user?.id && m.message === message)
      || msg
    )
  }

  /**
   * Apply chat message from another client (realtime / poll / postgres).
   * Dedupes by id AND by (user + text + ~8s window) to stop triple echoes.
   */
  function pushRemoteMessage(raw: Record<string, unknown>) {
    let id = String(raw.id || '')
    const message = String(raw.message || '').trim()
    const userId = String(raw.user_id || '')
    const created = String(raw.created_at || '')
    if (!message) return

    // Synthetic id if missing (shouldn't happen often)
    if (!id) {
      id = `syn-${userId}-${message}-${created || Date.now()}`
    }

    if (messages.value.some(m => m.id === id)) {
      // Upgrade nickname if we already have a shell without profile
      const existing = messages.value.find(m => m.id === id)
      if (existing && !existing.profile?.nickname?.trim()) {
        existing.profile = resolveProfile(userId, raw.profile as ChatMessage['profile'])
      }
      return
    }

    const msgRoomId = String(raw.room_id || '')
    if (room.value?.id && msgRoomId && msgRoomId !== room.value.id) {
      return
    }

    // Content dedupe: same user + same text within 8s (broadcast + poll + postgres)
    const createdMs = created ? new Date(created).getTime() : Date.now()
    const dup = messages.value.find((m) => {
      if (m.user_id !== userId || m.message !== message) return false
      const t = new Date(m.created_at).getTime()
      return Math.abs(t - createdMs) < 8000
    })
    if (dup) {
      // Prefer richer profile / stable server id
      if (!dup.profile?.nickname?.trim()) {
        dup.profile = resolveProfile(userId, raw.profile as ChatMessage['profile'])
      }
      // If local client id and server id differ, keep one — adopt server id
      if (id && dup.id !== id && !dup.id.startsWith('syn-')) {
        // keep existing
      } else if (id && dup.id !== id) {
        dup.id = id
      }
      return
    }

    const msg: ChatMessage = {
      id,
      room_id: msgRoomId || room.value?.id || '',
      user_id: userId,
      round_id: (raw.round_id as string) || null,
      message,
      message_type: (raw.message_type as ChatMessage['message_type']) || 'chat',
      is_hidden: !!raw.is_hidden,
      mentions: (raw.mentions as string[]) || [],
      created_at: created || new Date().toISOString(),
      profile: resolveProfile(userId, raw.profile as ChatMessage['profile']),
    }
    if (room.value?.id && msg.room_id && msg.room_id !== room.value.id) return
    messages.value = [...messages.value, msg]
  }

  /** Display nickname helper for UI */
  function chatNickname(m: ChatMessage): string {
    return resolveProfile(m.user_id, m.profile).nickname
  }

  async function startGame() {
    if (!room.value) throw new Error('Tidak ada room')

    await refreshLobbyState()

    // Strict host only — no role fallback, no local solo start
    if (!auth.user?.id || room.value.host_id !== auth.user.id) {
      throw new Error('Hanya host yang bisa start game.')
    }

    if (connectedPlayers.value.length < 2) {
      throw new Error('Minimal 2 pemain untuk mulai game.')
    }

    if (!allReady.value) {
      throw new Error(
        `Masih ada ${notReadyCount.value} pemain yang belum Ready. Tunggu semua ready dulu.`,
      )
    }

    const token = await auth.getAccessToken()
    if (!token || !auth.hasSupabaseSession) {
      throw new Error('Session hilang. Refresh & login ulang.')
    }

    // Server re-validates host + ready — never force-start on client
    const res = await $fetch<{
      room: Room
      session: GameSession
      members: RoomMember[]
    }>('/api/rooms/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { room_id: room.value.id },
    })

    room.value = res.room
    session.value = res.session
    members.value = normalizeMembers(res.members || []).map(m => ({ ...m, score: 0 }))
    persistLocal()
    return res.session
  }

  function persistLocal() {
    if (!import.meta.client || !room.value) return
    try {
      localStorage.setItem(`dg_room_${room.value.code}`, JSON.stringify({
        room: room.value,
        members: members.value,
        session: session.value,
      }))
    } catch { /* ignore */ }
  }

  return {
    room,
    members,
    messages,
    session,
    currentRound,
    loading,
    error,
    typingUsers,
    lastSyncAt,
    syncError,
    isHost,
    myMember,
    isSpectator,
    activeMembers,
    connectedPlayers,
    allReady,
    notReadyCount,
    sortedByScore,
    reset,
    createRoom,
    joinRoom,
    fetchMembers,
    refreshLobbyState,
    fetchMessages,
    toggleReady,
    leaveRoom,
    kickPlayer,
    transferHost,
    sendChat,
    pushRemoteMessage,
    chatNickname,
    startGame,
    persistLocal,
  }
})
