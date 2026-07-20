<script setup lang="ts">
import { toast } from 'vue-sonner'

const auth = useAuthStore()

const quests = ref([
  { id: '1', name: 'Main 3 Game', progress: 1, target: 3, xp: 40, coins: 20, claimed: false },
  { id: '2', name: 'Menang 1 Game', progress: 0, target: 1, xp: 50, coins: 30, claimed: false },
  { id: '3', name: 'Tebak 10 Gambar', progress: 4, target: 10, xp: 35, coins: 15, claimed: false },
  { id: '4', name: 'Gambar 5 Ronde', progress: 2, target: 5, xp: 40, coins: 20, claimed: false },
  { id: '5', name: 'Login Harian', progress: 1, target: 1, xp: 20, coins: 10, claimed: false },
])

onMounted(() => auth.init())

async function claim(q: typeof quests.value[0]) {
  if (q.progress < q.target || q.claimed) return
  if (!auth.profile) await auth.loginAsGuest()
  q.claimed = true
  await auth.updateProfile({
    xp: (auth.profile?.xp ?? 0) + q.xp,
    coins: (auth.profile?.coins ?? 0) + q.coins,
  })
  toast.success(`+${q.xp} XP · +${q.coins} 🪙`)
}
</script>

<template>
  <div class="page-container max-w-xl">
    <h1 class="section-title mb-2">Daily Quests</h1>
    <p class="mb-6 text-slate-500">Selesaikan misi harian untuk XP & koin</p>

    <div class="space-y-3">
      <div v-for="q in quests" :key="q.id" class="card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <p class="font-black">{{ q.name }}</p>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                class="h-full rounded-full bg-brand-blue-500 transition-all"
                :style="{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }"
              />
            </div>
            <p class="mt-1 text-xs text-slate-400">{{ q.progress }}/{{ q.target }} · +{{ q.xp }} XP · +{{ q.coins }} 🪙</p>
          </div>
          <AppButton
            size="sm"
            :variant="q.claimed ? 'outline' : 'primary'"
            :disabled="q.progress < q.target || q.claimed"
            @click="claim(q)"
          >
            {{ q.claimed ? 'Claimed' : 'Claim' }}
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
