<script setup lang="ts">
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import { QUICK_CHAT, DEFAULT_EMOTES, CHAT_MAX_LENGTH } from '~/utils/constants'
import { sanitizeChat, isSpammy } from '~/utils/sanitize'
import type { ChatMessage } from '~/types'

const roomStore = useRoomStore()
const game = useGameStore()
const auth = useAuthStore()
const { play } = useSound()

const { room, messages } = storeToRefs(roomStore)
const channel = useRoomChannel(computed(() => room.value?.id))

const input = ref('')
const listRef = ref<HTMLElement | null>(null)
const recent = ref<string[]>([])
const showQuick = ref(false)
const showEmotes = ref(false)
const syncLabel = ref('…')

const canSend = computed(() => input.value.trim().length > 0)

function scrollBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

watch(() => messages.value.length, scrollBottom)

async function pushAndBroadcast(msg: ChatMessage) {
  // Local already has it from sendChat; ensure remote peers get it
  const ok = await channel.sendChat({
    id: msg.id,
    room_id: msg.room_id,
    user_id: msg.user_id,
    round_id: msg.round_id,
    message: msg.message,
    message_type: msg.message_type,
    is_hidden: msg.is_hidden,
    created_at: msg.created_at,
    profile: msg.profile,
  })
  syncLabel.value = ok ? `rt:${channel.channelStatus()}` : 'rt:fail'
  return ok
}

/** Also post via server API for durable poll fallback */
async function postServerChat(
  text: string,
  messageType: ChatMessage['message_type'],
  clientId?: string,
) {
  if (!room.value?.id) return null
  const token = await auth.getAccessToken()
  if (!token) return null
  try {
    const res = await $fetch<{ message: ChatMessage }>('/api/rooms/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        room_id: room.value.id,
        message: text,
        message_type: messageType,
        client_id: clientId,
      },
    })
    return res.message
  } catch (e) {
    console.warn('[chat] server post failed', e)
    return null
  }
}

// Realtime receive
let offChat: (() => void) | null = null
let offGame: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await channel.waitSubscribed()
  syncLabel.value = channel.channelStatus()

  offChat = channel.onChat((raw) => {
    console.log('[GameChat] remote chat', raw)
    roomStore.pushRemoteMessage(raw)
    scrollBottom()
  })

  offGame = channel.onGame((type, data) => {
    if (type === 'guess_result') {
      const userId = String(data.user_id || '')
      const points = Number(data.points || 0)
      const correct = !!data.correct
      const nickname = String(data.nickname || 'Player')

      if (correct) {
        if (userId !== auth.user?.id) {
          game.applyCorrectGuess({ userId, points, nickname })
          play('correct')
          toast.success(`${nickname} benar! +${points}`)
        }
        if (Array.isArray(data.scores)) {
          for (const s of data.scores as { user_id: string; score: number }[]) {
            const m = roomStore.members.find(x => x.user_id === s.user_id)
            if (m) m.score = s.score
          }
        }
        if (data.all_done) {
          if (data.word) game.selectedWord = String(data.word)
          game.endRound()
          setTimeout(() => {
            if (game.phase === 'revealing') game.phase = 'scoreboard'
          }, 2500)
        }
      }
    } else if (type === 'round_end') {
      if (data.word) game.selectedWord = String(data.word)
      if (game.phase === 'drawing' || game.phase === 'selecting') {
        game.endRound()
      }
      if (Array.isArray(data.scores)) {
        for (const s of data.scores as { user_id: string; score: number }[]) {
          const m = roomStore.members.find(x => x.user_id === s.user_id)
          if (m) m.score = s.score
        }
      }
      setTimeout(() => {
        if (game.phase === 'revealing') game.phase = 'scoreboard'
      }, 2500)
    } else if (type === 'next_round') {
      if (!roomStore.isHost) {
        game.startRemoteNextRound({
          roundNumber: Number(data.roundNumber) || 1,
          drawerId: String(data.drawerId || ''),
          scores: data.scores as { user_id: string; score: number }[] | undefined,
        })
      }
    } else if (type === 'game_over') {
      game.finishGame()
    }
  })

  // Poll fallback every 1.5s — guarantees drawer sees guesses even if Realtime fails
  pollTimer = setInterval(pollChat, 1500)
  await pollChat()
})

onUnmounted(() => {
  offChat?.()
  offGame?.()
  if (pollTimer) clearInterval(pollTimer)
})

async function pollChat() {
  const roomId = room.value?.id
  if (!roomId) return
  try {
    // Only use "since" for messages that belong to THIS room
    const last = [...messages.value].reverse().find(m => m.room_id === roomId)
    const since = last?.created_at
    const qs = new URLSearchParams({ room_id: roomId })
    if (since) qs.set('since', since)
    const res = await $fetch<{ messages: ChatMessage[] }>(`/api/rooms/chat?${qs}`)
    for (const m of res.messages || []) {
      if (m.room_id && m.room_id !== roomId) continue
      roomStore.pushRemoteMessage({
        ...(m as unknown as Record<string, unknown>),
        room_id: m.room_id || roomId,
      })
    }
    // Drop any leftover messages from other rooms
    if (messages.value.some(m => m.room_id && m.room_id !== roomId)) {
      const cleaned = messages.value.filter(m => !m.room_id || m.room_id === roomId)
      // replace array contents reactively
      roomStore.messages.splice(0, roomStore.messages.length, ...cleaned)
    }
    if (res.messages?.length) scrollBottom()
    syncLabel.value = `${channel.channelStatus()} · poll ok`
  } catch {
    syncLabel.value = `${channel.channelStatus()} · poll fail`
  }
}

async function send() {
  const text = sanitizeChat(input.value, CHAT_MAX_LENGTH)
  if (!text) return
  if (isSpammy(text, recent.value)) {
    play('wrong')
    return
  }

  if (game.isDrawer && game.phase === 'drawing') {
    play('wrong')
    toast.message('Drawer: lihat tebakan di panel chat (tidak bisa mengetik)')
    input.value = ''
    return
  }

  if (game.canGuess) {
    // 1) Local + broadcast guess text so drawer sees it immediately
    const guessMsg = await roomStore.sendChat(text, 'guess')
    if (guessMsg) {
      await pushAndBroadcast(guessMsg)
      // 2) Server persist for poll
      await postServerChat(text, 'guess', guessMsg.id)
    }

    const result = await game.submitGuess(text)

    if (result.correct) {
      play('correct')
      toast.success(`Benar! +${result.points}`)

      const correctText = `✓ Benar! (+${result.points})`
      const correctMsg = await roomStore.sendChat(correctText, 'correct')
      if (correctMsg) {
        await pushAndBroadcast(correctMsg)
        await postServerChat(correctText, 'correct', correctMsg.id)
      }

      const scores = roomStore.members.map(m => ({ user_id: m.user_id, score: m.score }))
      await channel.sendGame('guess_result', {
        correct: true,
        user_id: auth.user?.id,
        nickname: auth.profile?.nickname || 'Player',
        points: result.points,
        is_first: result.isFirst,
        all_done: result.allDone,
        guess_text: text,
        word: result.allDone ? game.selectedWord : undefined,
        scores,
      })

      if (result.allDone) {
        await channel.sendGame('round_end', {
          word: game.selectedWord,
          scores,
        })
        setTimeout(() => {
          if (game.phase === 'revealing') game.phase = 'scoreboard'
        }, 2500)
      }
    } else {
      play('wrong')
      await channel.sendGame('guess_result', {
        correct: false,
        user_id: auth.user?.id,
        nickname: auth.profile?.nickname || 'Player',
        guess_text: text,
        points: 0,
      })
    }
  } else {
    const msg = await roomStore.sendChat(text, 'chat')
    if (msg) {
      await pushAndBroadcast(msg)
      await postServerChat(text, 'chat', msg.id)
    }
    play('click')
  }

  recent.value = [...recent.value.slice(-10), text]
  input.value = ''
  scrollBottom()
}

function quick(msg: string) {
  input.value = msg
  send()
  showQuick.value = false
}

function emote(emoji: string) {
  game.pushEmote(emoji)
  channel.sendGame('emote', {
    user_id: auth.user?.id,
    emoji,
    nickname: auth.profile?.nickname,
    timestamp: Date.now(),
  })
  showEmotes.value = false
}

function msgClass(type: string) {
  if (type === 'correct') return 'rounded-lg bg-emerald-500/20 px-2 py-1 font-bold text-emerald-300'
  if (type === 'guess') return 'text-slate-200'
  if (type === 'system') return 'text-center text-xs italic text-slate-400'
  return 'text-slate-200'
}
</script>

<template>
  <div class="flex h-full min-h-[220px] flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-800">
    <div class="flex items-center justify-between border-b border-slate-700 px-3 py-2">
      <h3 class="text-sm font-black text-white">
        {{ game.canGuess ? '💬 Tebak' : game.isDrawer ? '💬 Tebakan lawan' : '💬 Chat' }}
      </h3>
      <span class="text-[10px] text-slate-500">{{ syncLabel }}</span>
    </div>

    <div v-if="showQuick" class="flex flex-wrap gap-1 border-b border-slate-700 p-2">
      <button
        v-for="q in QUICK_CHAT"
        :key="q.id"
        type="button"
        class="rounded-lg bg-slate-700 px-2 py-1 text-xs font-bold text-white"
        @click="quick(room?.language === 'en' ? q.en : q.id_text)"
      >
        {{ room && room.language === 'en' ? q.en : q.id_text }}
      </button>
    </div>

    <div v-if="showEmotes" class="flex flex-wrap gap-2 border-b border-slate-700 p-2">
      <button v-for="e in DEFAULT_EMOTES" :key="e" type="button" class="text-2xl" @click="emote(e)">
        {{ e }}
      </button>
    </div>

    <div ref="listRef" class="flex-1 space-y-1.5 overflow-y-auto p-3">
      <div
        v-for="m in messages"
        :key="m.id"
        class="text-sm"
        :class="msgClass(m.message_type)"
      >
        <template v-if="m.message_type === 'correct'">
          <span class="font-black text-emerald-300">{{ m.profile?.nickname || 'Player' }}</span>
          {{ m.message }}
        </template>
        <template v-else-if="m.message_type === 'guess'">
          <span class="font-bold text-sky-400">{{ m.profile?.nickname || 'Player' }}:</span>
          {{ m.message }}
        </template>
        <template v-else>
          <span class="font-bold text-blue-400">{{ m.profile?.nickname || 'Player' }}:</span>
          {{ m.message }}
        </template>
      </div>
      <p v-if="!messages.length" class="py-6 text-center text-xs text-slate-500">
        {{ game.isDrawer ? 'Menunggu tebakan lawan...' : 'Ketik tebakan di bawah' }}
      </p>
    </div>

    <form class="flex gap-2 border-t border-slate-700 p-2" @submit.prevent="send">
      <input
        v-model="input"
        class="input py-2 text-sm"
        :placeholder="game.canGuess ? 'Tulis tebakan...' : game.isDrawer ? 'Hanya lihat tebakan ↑' : 'Chat...'"
        :maxlength="CHAT_MAX_LENGTH"
        :disabled="(game.isDrawer && game.phase === 'drawing') || roomStore.isSpectator"
      >
      <button
        type="submit"
        class="rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        :disabled="!canSend || (game.isDrawer && game.phase === 'drawing')"
      >
        Kirim
      </button>
    </form>
  </div>
</template>
