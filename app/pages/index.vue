<script setup lang="ts">
import { toast } from 'vue-sonner'

const auth = useAuthStore()
const { fadeIn, staggerChildren } = useGsap()
const root = ref<HTMLElement | null>(null)
const showJoin = ref(false)
const joinCode = ref('')
const joinPassword = ref('')
const guestName = ref('')
const supabaseStatus = ref<{ ok: boolean; message: string } | null>(null)

onMounted(async () => {
  await auth.init()
  supabaseStatus.value = await checkSupabaseConnection()
  await nextTick()
  if (root.value) {
    fadeIn(root.value.querySelector('.hero')!)
    staggerChildren(root.value.querySelector('.actions')!, 'a, button')
  }
})

async function ensureAuth() {
  if (!auth.isAuthenticated) {
    await auth.loginAsGuest(guestName.value || undefined)
  }
}

async function createRoom() {
  await ensureAuth()
  navigateTo('/create')
}

async function openJoin() {
  await ensureAuth()
  showJoin.value = true
}

async function doJoin() {
  const room = useRoomStore()
  try {
    await ensureAuth()
    await room.joinRoom(joinCode.value, joinPassword.value || undefined)
    toast.success('Bergabung ke room!')
    navigateTo(`/lobby/${room.room!.code}`)
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Gagal join')
  }
}

function quickPlay() {
  createRoom()
}
</script>

<template>
  <div ref="root" class="page-container">
    <!-- Hero -->
    <section class="hero mx-auto max-w-3xl py-10 text-center sm:py-16">
      <div class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-orange-500 text-white shadow-card">
        <Icon name="mdi:pencil" class="h-10 w-10" />
      </div>
      <h1 class="text-4xl font-black tracking-tight text-slate-800 sm:text-5xl dark:text-white">
        Draw <span class="text-brand-orange-500">&</span> Guess
      </h1>
      <p class="mx-auto mt-3 max-w-lg text-lg text-slate-500 dark:text-slate-400">
        Gambar, tebak, dan bersenang-senang bersama teman — real-time multiplayer!
      </p>

      <p
        v-if="supabaseStatus"
        class="mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
        :class="supabaseStatus.ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'"
      >
        <span class="h-2 w-2 rounded-full" :class="supabaseStatus.ok ? 'bg-emerald-500' : 'bg-amber-500'" />
        {{ supabaseStatus.ok ? 'Supabase connected' : `Supabase: ${supabaseStatus.message}` }}
      </p>

      <div v-if="!auth.isAuthenticated" class="mx-auto mt-6 max-w-xs">
        <AppInput v-model="guestName" placeholder="Nickname kamu..." :maxlength="20" />
      </div>
    </section>

    <!-- Actions -->
    <section class="actions mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
      <button
        class="card-hover flex flex-col items-center gap-3 p-6 text-center"
        @click="quickPlay"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange-100 text-brand-orange-600 dark:bg-brand-orange-900/40">
          <Icon name="mdi:play" class="h-7 w-7" />
        </div>
        <span class="text-lg font-black">Play / Create Room</span>
        <span class="text-sm text-slate-500">Buat room baru & undang teman</span>
      </button>

      <button
        class="card-hover flex flex-col items-center gap-3 p-6 text-center"
        @click="openJoin"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue-100 text-brand-blue-600 dark:bg-brand-blue-900/40">
          <Icon name="mdi:login" class="h-7 w-7" />
        </div>
        <span class="text-lg font-black">Join Room</span>
        <span class="text-sm text-slate-500">Masuk dengan kode room</span>
      </button>
    </section>

    <!-- Feature cards -->
    <section class="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
      <div class="card p-5 text-center">
        <div class="mb-2 text-3xl">🎨</div>
        <h3 class="font-black">Gambar Real-time</h3>
        <p class="mt-1 text-sm text-slate-500">Canvas Konva sinkron via Supabase Realtime</p>
      </div>
      <div class="card p-5 text-center">
        <div class="mb-2 text-3xl">⚡</div>
        <h3 class="font-black">Cepat & Fun</h3>
        <p class="mt-1 text-sm text-slate-500">Skor, streak, achievement, daily quest</p>
      </div>
      <div class="card p-5 text-center">
        <div class="mb-2 text-3xl">🏆</div>
        <h3 class="font-black">Kompetitif</h3>
        <p class="mt-1 text-sm text-slate-500">Leaderboard, shop, cosmetics, friends</p>
      </div>
    </section>

    <section class="mx-auto mt-10 flex max-w-md flex-wrap justify-center gap-3">
      <NuxtLink to="/leaderboard" class="btn-outline btn-sm">Leaderboard</NuxtLink>
      <NuxtLink to="/shop" class="btn-outline btn-sm">Shop</NuxtLink>
      <NuxtLink to="/history" class="btn-outline btn-sm">History</NuxtLink>
      <NuxtLink to="/profile" class="btn-outline btn-sm">Profile</NuxtLink>
    </section>

    <AppModal v-model="showJoin" title="Join Room" size="sm">
      <div class="space-y-4">
        <AppInput v-model="joinCode" label="Kode Room" placeholder="ABC123" :maxlength="8" />
        <AppInput v-model="joinPassword" label="Password (opsional)" type="password" placeholder="••••" />
        <AppButton block :loading="useRoomStore().loading" @click="doJoin">
          Masuk
        </AppButton>
      </div>
    </AppModal>
  </div>
</template>
