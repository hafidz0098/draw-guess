<script setup lang="ts">
import { toast } from 'vue-sonner'

const route = useRoute()
const auth = useAuthStore()
const room = useRoomStore()

const code = ref((route.query.code as string) || '')
const password = ref('')

onMounted(async () => {
  await auth.init()
  if (!auth.isAuthenticated) await auth.loginAsGuest()
  if (code.value && !password.value) {
    // auto try if no password expected
  }
})

async function submit() {
  try {
    if (!auth.isAuthenticated) await auth.loginAsGuest()
    try { useGameStore().reset() } catch { /* ignore */ }
    await room.joinRoom(code.value, password.value || undefined)
    toast.success('Berhasil join!')
    navigateTo(`/lobby/${room.room!.code}`)
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Gagal join')
  }
}
</script>

<template>
  <div class="page-container max-w-md">
    <h1 class="section-title mb-6">Join Room</h1>
    <form class="card space-y-4 p-6" @submit.prevent="submit">
      <AppInput v-model="code" label="Kode Room" placeholder="ABC123" :maxlength="8" />
      <AppInput v-model="password" label="Password (jika ada)" type="password" />
      <AppButton type="submit" block :loading="room.loading">Masuk Lobby</AppButton>
    </form>
  </div>
</template>
