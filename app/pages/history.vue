<script setup lang="ts">
const auth = useAuthStore()

const demoHistory = [
  { id: '1', room_name: 'Room Seru', final_score: 420, final_rank: 1, is_winner: true, correct_guesses: 5, times_drew: 2, xp_earned: 80, coins_earned: 40, played_at: new Date().toISOString() },
  { id: '2', room_name: 'Friday Night', final_score: 280, final_rank: 3, is_winner: false, correct_guesses: 3, times_drew: 1, xp_earned: 40, coins_earned: 15, played_at: new Date(Date.now() - 86400000).toISOString() },
  { id: '3', room_name: 'Quick Match', final_score: 150, final_rank: 4, is_winner: false, correct_guesses: 2, times_drew: 1, xp_earned: 25, coins_earned: 10, played_at: new Date(Date.now() - 172800000).toISOString() },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

onMounted(() => auth.init())
</script>

<template>
  <div class="page-container max-w-2xl">
    <h1 class="section-title mb-2">Match History</h1>
    <p class="mb-6 text-slate-500">Riwayat pertandingan kamu</p>

    <div class="space-y-3">
      <div
        v-for="h in demoHistory"
        :key="h.id"
        class="card flex items-center gap-4 p-4"
      >
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black"
          :class="h.is_winner ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'"
        >
          #{{ h.final_rank }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-black truncate">{{ h.room_name }}</p>
          <p class="text-xs text-slate-400">{{ formatDate(h.played_at) }}</p>
          <p class="text-xs text-slate-500 mt-0.5">
            {{ h.correct_guesses }} tebakan · {{ h.times_drew }} draw · +{{ h.xp_earned }} XP · +{{ h.coins_earned }} 🪙
          </p>
        </div>
        <div class="text-right">
          <p class="text-lg font-black text-brand-orange-500">{{ h.final_score }}</p>
          <span v-if="h.is_winner" class="badge-orange">Winner</span>
        </div>
      </div>
    </div>
  </div>
</template>
