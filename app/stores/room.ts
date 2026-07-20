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

  const isHost = computed(() => {
    if (!room.value || !auth.user?.id) return false
    if (room.value.host_id === auth.user.id) return true
    const me = members.value.find(m => m.user_id === auth.user?.id)
    return me?.role === 'host'
  })

  const myMember = computed(() => members.value.find(m => m.user_id === auth.user?.id))
  const isSpectator = computed(() => myMember.value?.role === 'spectator')

  const activeMembers = computed(() => members.value.filter(isMemberActive))

  const connectedPlayers = computed(() =>
    activeMembers.value.filter(m => m.role !== 'spectator'),
  )

  const allReady = computed(() =>
    connectedPlayers.value.length >= 2
    && connectedPlayers.value.every(m => m.is_ready || m.role === 'host'),
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
    const next = !myMember.value.is_ready
    myMember.value.is_ready = next
    const client = useSupabase()
    if (client) {
      await client.from('room_members').update({ is_ready: next }).eq('id', myMember.value.id)
    }
    // Also via service path refresh
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

  async function sendChat(
    message: string,
    messageType: ChatMessage['message_type'] = 'chat',
  ): Promise<ChatMessage | null> {
    if (!room.value || !auth.user || !auth.profile) return null
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
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

    // Best-effort DB persist (may fail RLS — realtime broadcast is primary sync)
    const client = useSupabase()
    if (client) {
      try {
        await client.from('chat_messages').insert({
          room_id: msg.room_id,
          user_id: msg.user_id,
          round_id: msg.round_id,
          message: msg.message,
          message_type: msg.message_type,
          is_hidden: msg.is_hidden,
        })
      } catch { /* ignore */ }
    }
    return msg
  }

  /** Apply chat message from another client (realtime or poll) */
  function pushRemoteMessage(raw: Record<string, unknown>) {
    const id = String(raw.id || '')
    if (!id) return
    if (messages.value.some(m => m.id === id)) return

    const msgRoomId = String(raw.room_id || '')
    // Ignore messages that don't belong to current room
    if (room.value?.id && msgRoomId && msgRoomId !== room.value.id) {
      return
    }
    if (room.value?.id && !msgRoomId) {
      // allow if no room_id on payload (legacy), will tag with current room
    }

    // Also dedupe by same user+message+second (poll vs broadcast)
    const message = String(raw.message || '')
    const userId = String(raw.user_id || '')
    const created = String(raw.created_at || '')
    if (
      message
      && userId
      && messages.value.some(
        m => m.user_id === userId
          && m.message === message
          && Math.abs(new Date(m.created_at).getTime() - new Date(created || Date.now()).getTime()) < 3000,
      )
    ) {
      return
    }

    const profileRaw = raw.profile as ChatMessage['profile'] | undefined
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
      profile: profileRaw || {
        id: userId,
        nickname: 'Player',
        avatar_url: null,
        level: 1,
      },
    }
    // Final guard
    if (room.value?.id && msg.room_id && msg.room_id !== room.value.id) return
    messages.value = [...messages.value, msg]
  }

  async function startGame() {
    if (!room.value) throw new Error('Tidak ada room')

    await refreshLobbyState()

    // Soft host check: still try server (server is source of truth)
    const token = await auth.getAccessToken()
    if (!token || !auth.hasSupabaseSession) {
      // Local solo start (no supabase session)
      session.value = {
        id: crypto.randomUUID(),
        room_id: room.value.id,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        winner_id: null,
        total_rounds: room.value.total_rounds,
      }
      room.value = { ...room.value, status: 'playing', current_round: 1 }
      members.value = members.value.map(m => ({ ...m, score: 0 }))
      persistLocal()
      return session.value
    }

    try {
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
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message
        || (e instanceof Error ? e.message : 'Gagal start di server')

      // Fallback: start locally so game UI still opens
      console.warn('[room] startGame server failed, local fallback:', msg)
      session.value = {
        id: crypto.randomUUID(),
        room_id: room.value.id,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
        winner_id: null,
        total_rounds: room.value.total_rounds,
      }
      room.value = { ...room.value, status: 'playing', current_round: 1 }
      members.value = members.value.map(m => ({ ...m, score: 0 }))
      if (!members.value.length && auth.user && auth.profile) {
        members.value = [{
          id: crypto.randomUUID(),
          room_id: room.value.id,
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
      return session.value
    }
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
    startGame,
    persistLocal,
  }
})
