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
  isHost,
  connectedPlayers,
  myMember,
  syncError,
  loading,
} = storeToRefs(roomStore)

const code = computed(() => String(route.params.code || '').toUpperCase())
const chatInput = ref('')
const starting = ref(false)
const startError = ref('')
const startLog = ref('')
const booting = ref(true)

const playerCount = computed(() => connectedPlayers.value.length)

// Host if room says so OR membership role is host
const canStartAsHost = computed(() => {
  if (isHost.value) return true
  if (myMember.value?.role === 'host') return true
  if (room.value?.host_id && auth.user?.id && room.value.host_id === auth.user.id) return true
  // Fallback: first connected member can start
  const first = connectedPlayers.value[0]
  return !!(first && first.user_id === auth.user?.id)
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

// When room becomes playing (from any source), go to game
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
  startLog.value = `Navigasi ke ${path}...`
  // Hard navigation — most reliable
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
  toast.message(`Pemain: ${playerCount.value}`)
}

/**
 * START GAME — always forces navigation to /game/:code
 */
async function start() {
  if (starting.value) return
  starting.value = true
  startError.value = ''
  startLog.value = '1. Start diklik...'

  const roomCode = room.value?.code || code.value
  if (!roomCode) {
    startError.value = 'Kode room hilang'
    starting.value = false
    return
  }

  try {
    startLog.value = '2. Sync lobby...'
    await roomStore.refreshLobbyState()

    startLog.value = '3. Reset game state...'
    game.reset()

    startLog.value = '4. Memanggil startGame()...'
    await roomStore.startGame()

    // Ensure local status is playing even if server lag
    if (roomStore.room) {
      roomStore.room.status = 'playing'
    }

    startLog.value = '5. Sukses — pindah ke game...'
    toast.success('Game dimulai!')

    // Small delay so pinia state flushes
    await nextTick()
    goToGame(roomCode)
  } catch (e: unknown) {
    console.error('[lobby] start error', e)
    const msg = (e as { data?: { message?: string } })?.data?.message
      || (e instanceof Error ? e.message : 'Gagal start')
    startError.value = msg
    startLog.value = `Error: ${msg} — tetap coba buka game...`
    toast.error(msg)

    // FORCE open game page anyway
    if (roomStore.room) {
      roomStore.room.status = 'playing'
    }
    await nextTick()
    goToGame(roomCode)
  } finally {
    // If hard nav works, this page unloads; otherwise unlock button
    setTimeout(() => {
      starting.value = false
    }, 3000)
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
                {{ playerCount }} / {{ room.max_players }} pemain
              </p>
              <p v-if="syncError" class="mt-1 text-xs font-bold text-red-400">Sync: {{ syncError }}</p>
              <p class="mt-1 text-xs text-slate-500">
                Status: {{ room.status }} · {{ canStartAsHost ? 'Bisa start' : 'Bukan host' }}
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
                v-if="m.role === 'host'"
                class="rounded bg-orange-500/20 px-2 text-[10px] font-bold text-orange-300"
              >HOST</span>
              <span
                v-else-if="m.is_ready"
                class="rounded bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-300"
              >READY</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="mt-6 flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <button
                v-if="!canStartAsHost"
                type="button"
                class="btn btn-primary"
                @click="roomStore.toggleReady()"
              >
                {{ myMember?.is_ready ? 'Cancel Ready' : 'Ready!' }}
              </button>

              <!-- Native button — no component click fallthrough issues -->
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-base font-black text-white shadow-card transition hover:bg-orange-600 active:scale-[0.97] disabled:opacity-50"
                :disabled="starting"
                @click="start"
              >
                <span
                  v-if="starting"
                  class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
                {{ starting ? 'Memulai...' : '▶ START GAME' }}
              </button>

              <button
                type="button"
                class="btn btn-ghost"
                @click="leave"
              >
                Leave
              </button>
            </div>

            <!-- Live feedback so user always sees something -->
            <div
              v-if="startLog || startError"
              class="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            >
              <p v-if="startLog" class="font-bold text-orange-300">{{ startLog }}</p>
              <p v-if="startError" class="mt-1 font-bold text-red-400">{{ startError }}</p>
            </div>

            <p class="text-sm text-slate-400">
              Setelah Start, browser akan pindah ke halaman game otomatis.
            </p>
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
