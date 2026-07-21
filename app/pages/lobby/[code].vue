<script setup lang="ts">
import { toast } from 'vue-sonner'
import { inviteLink } from '~/utils/room'
import { storeToRefs } from 'pinia'

definePageMeta({ layout: 'game' })

const route = useRoute()
const auth = useAuthStore()
const roomStore = useRoomStore()
const game = useGameStore()
const config = useRuntimeConfig()
const { play } = useSound()

const {
  room,
  messages,
  connectedPlayers,
  myMember,
  syncError,
  loading,
  allReady,
  notReadyCount,
} = storeToRefs(roomStore)

const code = computed(() => String(route.params.code || '').toUpperCase())
const chatInput = ref('')
const starting = ref(false)
const startError = ref('')
const booting = ref(true)

const playerCount = computed(() => connectedPlayers.value.length)

/** Strict: only rooms.host_id — never role fallback / first-member fallback */
const iAmHost = computed(() => {
  if (!auth.user?.id || !room.value?.host_id) return false
  return room.value.host_id === auth.user.id
})

const canStart = computed(() =>
  iAmHost.value
  && playerCount.value >= 2
  && allReady.value
  && room.value?.status === 'waiting'
  && !starting.value,
)

const readySummary = computed(() => {
  const total = playerCount.value
  const hostId = room.value?.host_id
  const ready = connectedPlayers.value.filter((m) => {
    if (hostId && m.user_id === hostId) return true
    return !!m.is_ready
  }).length
  return `${ready}/${total} ready`
})

useRoomRealtime(computed(() => room.value?.id))

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    await auth.init()
    await auth.ensureSupabaseUser()

    if (!room.value || room.value.code !== code.value) {
      await roomStore.joinRoom(code.value)
    } else {
      await roomStore.refreshLobbyState()
    }
    play('join')
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Gagal masuk lobby')
    await navigateTo('/')
    return
  } finally {
    booting.value = false
  }

  pollTimer = setInterval(() => {
    if (room.value?.status === 'playing') return
    roomStore.refreshLobbyState()
  }, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

watch(
  () => room.value?.status,
  (status) => {
    if (status === 'playing' && code.value && !starting.value) {
      goToGame(code.value)
    }
  },
)

function goToGame(roomCode: string) {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  const path = `/game/${roomCode}`
  if (import.meta.client) {
    window.location.assign(path)
  } else {
    navigateTo(path)
  }
}

const invite = computed(() =>
  room.value ? inviteLink(room.value.code, String(config.public.appUrl)) : '',
)

async function copyCode() {
  await navigator.clipboard.writeText(room.value?.code || '')
  toast.success('Kode disalin!')
}

async function copyInvite() {
  await navigator.clipboard.writeText(invite.value)
  toast.success('Link disalin!')
}

async function refresh() {
  await roomStore.refreshLobbyState()
  toast.message(`Pemain: ${playerCount.value} · ${readySummary.value}`)
}

async function onToggleReady() {
  if (iAmHost.value) {
    toast.message('Host otomatis ready')
    return
  }
  try {
    await roomStore.toggleReady()
    toast.success(myMember.value?.is_ready ? 'Kamu Ready!' : 'Ready dibatalkan')
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Gagal update Ready')
  }
}

async function start() {
  if (starting.value) return
  startError.value = ''

  // Hard gate: non-host never starts
  if (!iAmHost.value) {
    toast.error('Hanya host yang bisa start game')
    return
  }

  await roomStore.refreshLobbyState()

  if (playerCount.value < 2) {
    toast.error('Minimal 2 pemain untuk mulai')
    return
  }

  if (!allReady.value) {
    toast.error(`Masih ada ${notReadyCount.value} pemain belum Ready`)
    return
  }

  if (!canStart.value) {
    toast.error('Belum bisa start — cek jumlah pemain & status Ready')
    return
  }

  starting.value = true
  try {
    game.reset()
    await roomStore.startGame()
    toast.success('Game dimulai!')
    await nextTick()
    goToGame(room.value!.code)
  } catch (e: unknown) {
    console.error('[lobby] start error', e)
    const msg = (e as { data?: { message?: string } })?.data?.message
      || (e instanceof Error ? e.message : 'Gagal start')
    startError.value = msg
    toast.error(msg)
    // Stay in lobby on failure — never force navigate
  } finally {
    starting.value = false
  }
}

async function leave() {
  play('leave')
  await roomStore.leaveRoom()
  await navigateTo('/')
}

async function sendLobbyChat() {
  if (!chatInput.value.trim()) return
  await roomStore.sendChat(chatInput.value.trim())
  chatInput.value = ''
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div v-if="booting" class="py-20 text-center text-slate-400">
      Memuat lobby...
    </div>

    <div v-else-if="room" class="grid gap-4 lg:grid-cols-3">
      <div class="space-y-4 lg:col-span-2">
        <div class="card p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-2xl font-black text-white">{{ room.name }}</h1>
              <p class="mt-1 text-sm text-slate-400">
                {{ room.total_rounds }} ronde · {{ room.draw_time }}s · {{ room.language?.toUpperCase() }}
              </p>
              <p class="mt-2 text-base font-black text-orange-500">
                {{ playerCount }} / {{ room.max_players }} pemain · {{ readySummary }}
              </p>
              <p v-if="syncError" class="mt-1 text-xs font-bold text-red-400">Sync: {{ syncError }}</p>
              <p class="mt-1 text-xs text-slate-500">
                Kamu: <b class="text-white">{{ iAmHost ? 'HOST' : 'PLAYER' }}</b>
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-xl bg-orange-500 px-3 py-1 text-sm font-black text-white"
                @click="copyCode"
              >
                Kode: {{ room.code }}
              </button>
              <AppButton size="sm" variant="outline" @click="copyInvite">Invite</AppButton>
              <AppButton size="sm" variant="ghost" :loading="loading" @click="refresh">↻</AppButton>
            </div>
          </div>

          <!-- Players -->
          <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <div
              v-for="m in connectedPlayers"
              :key="m.id || m.user_id"
              class="flex flex-col items-center gap-1 rounded-2xl bg-slate-800 p-3"
            >
              <AppAvatar
                :src="m.profile?.avatar_url"
                :name="m.profile?.nickname || 'P'"
                size="lg"
                online
              />
              <p class="w-full truncate text-center text-xs font-bold text-white">
                {{ m.profile?.nickname || m.user_id?.slice(0, 6) }}
              </p>
              <span
                v-if="m.user_id === room.host_id"
                class="rounded bg-orange-500/20 px-2 text-[10px] font-bold text-orange-300"
              >HOST</span>
              <span
                v-else-if="m.is_ready"
                class="rounded bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-300"
              >READY ✓</span>
              <span
                v-else
                class="rounded bg-slate-700 px-2 text-[10px] font-bold text-slate-400"
              >NOT READY</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="mt-6 flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <!-- Non-host: Ready only -->
              <button
                v-if="!iAmHost"
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-black text-white shadow-card transition active:scale-[0.97]"
                :class="myMember?.is_ready ? 'bg-slate-600 hover:bg-slate-500' : 'bg-emerald-500 hover:bg-emerald-600'"
                @click="onToggleReady"
              >
                {{ myMember?.is_ready ? 'Cancel Ready' : '✓ Ready!' }}
              </button>

              <!-- Host only: Start Game (hidden for non-host) -->
              <button
                v-if="iAmHost"
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-base font-black text-white shadow-card transition hover:bg-orange-600 active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canStart"
                :title="canStart ? 'Mulai game' : 'Semua pemain non-host harus Ready dulu'"
                @click.prevent="start"
              >
                <span
                  v-if="starting"
                  class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
                {{ starting ? 'Memulai...' : '▶ START GAME' }}
              </button>

              <button type="button" class="btn btn-ghost" @click="leave">
                Leave
              </button>
            </div>

            <!-- Status hints -->
            <div
              v-if="iAmHost"
              class="rounded-xl border px-3 py-2 text-sm font-bold"
              :class="canStart
                ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-600/50 bg-amber-500/10 text-amber-200'"
            >
              <template v-if="playerCount < 2">
                Tunggu minimal 1 pemain lagi join (kode {{ room.code }})
              </template>
              <template v-else-if="!allReady">
                Menunggu {{ notReadyCount }} pemain Ready... ({{ readySummary }})
              </template>
              <template v-else>
                Semua ready ({{ readySummary }}) — klik Start Game!
              </template>
            </div>
            <div
              v-else
              class="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-300"
            >
              <template v-if="myMember?.is_ready">
                Kamu sudah Ready. Menunggu host memulai...
              </template>
              <template v-else>
                Tekan <b class="text-emerald-400">Ready!</b> agar host bisa start.
              </template>
            </div>

            <p v-if="startError" class="text-sm font-bold text-red-400">{{ startError }}</p>
          </div>
        </div>
      </div>

      <!-- Chat -->
      <div class="card flex h-[420px] flex-col">
        <div class="border-b border-slate-700 px-3 py-2 text-sm font-black">Chat</div>
        <div class="flex-1 space-y-1 overflow-y-auto p-3">
          <div v-for="m in messages" :key="m.id" class="text-sm">
            <span class="font-bold text-blue-400">{{ m.profile?.nickname }}:</span>
            {{ m.message }}
          </div>
        </div>
        <form class="flex gap-2 border-t border-slate-700 p-2" @submit.prevent="sendLobbyChat">
          <input v-model="chatInput" class="input py-2 text-sm" placeholder="Chat...">
          <AppButton type="submit" size="sm">Kirim</AppButton>
        </form>
      </div>
    </div>

    <div v-else class="py-20 text-center text-slate-400">
      Room tidak ditemukan
    </div>
  </div>
</template>
