<script setup lang="ts">
import type { LeaderboardPeriod } from '~/types'

const auth = useAuthStore()
const period = ref<LeaderboardPeriod>('all_time')

const periods: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all_time', label: 'All Time' },
]

// Demo data when Supabase empty
const demoEntries = computed(() => {
  const base = [
    { rank: 1, nickname: 'PixelMaster', level: 42, xp: 4200, wins: 120, accuracy: 78, title: 'Legend' },
    { rank: 2, nickname: 'SketchQueen', level: 38, xp: 3800, wins: 98, accuracy: 82, title: 'Pro Drawer' },
    { rank: 3, nickname: 'GuessGuru', level: 35, xp: 3500, wins: 90, accuracy: 88, title: 'Fast Guesser' },
    { rank: 4, nickname: 'ColorNinja', level: 30, xp: 3000, wins: 70, accuracy: 71, title: 'Artist' },
    { rank: 5, nickname: 'DoodleKing', level: 28, xp: 2800, wins: 65, accuracy: 69, title: 'Veteran' },
  ]
  if (auth.profile) {
    base.push({
      rank: 6,
      nickname: auth.profile.nickname,
      level: auth.profile.level,
      xp: auth.profile.xp,
      wins: auth.profile.total_wins,
      accuracy: auth.profile.total_guesses
        ? Math.round((auth.profile.correct_guesses / auth.profile.total_guesses) * 100)
        : 0,
      title: auth.profile.title,
    })
  }
  return base
})

onMounted(() => auth.init())
</script>

<template>
  <div class="page-container max-w-3xl">
    <h1 class="section-title mb-2">Leaderboard</h1>
    <p class="mb-6 text-slate-500">Top players · XP, wins & accuracy</p>

    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="p in periods"
        :key="p.id"
        class="rounded-xl px-4 py-2 text-sm font-bold transition-colors"
        :class="period === p.id ? 'bg-brand-orange-500 text-white' : 'bg-white text-slate-600 shadow-card dark:bg-slate-800 dark:text-slate-200'"
        @click="period = p.id"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="card overflow-hidden">
      <div class="grid grid-cols-12 gap-2 border-b border-slate-100 bg-surface-secondary px-4 py-2 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
        <span class="col-span-1">#</span>
        <span class="col-span-5">Player</span>
        <span class="col-span-2 text-right">XP</span>
        <span class="col-span-2 text-right">Wins</span>
        <span class="col-span-2 text-right">Acc</span>
      </div>
      <div
        v-for="e in demoEntries"
        :key="e.rank + e.nickname"
        class="grid grid-cols-12 items-center gap-2 px-4 py-3 border-b border-slate-50 last:border-0 dark:border-slate-800"
        :class="e.nickname === auth.profile?.nickname ? 'bg-brand-orange-50 dark:bg-brand-orange-900/20' : ''"
      >
        <span
          class="col-span-1 font-black"
          :class="e.rank === 1 ? 'text-amber-500' : e.rank === 2 ? 'text-slate-400' : e.rank === 3 ? 'text-orange-600' : 'text-slate-400'"
        >
          {{ e.rank }}
        </span>
        <div class="col-span-5 flex items-center gap-2 min-w-0">
          <AppAvatar :name="e.nickname" size="sm" />
          <div class="min-w-0">
            <p class="truncate font-bold text-sm">{{ e.nickname }}</p>
            <p class="text-xs text-slate-400">Lv.{{ e.level }} · {{ e.title }}</p>
          </div>
        </div>
        <span class="col-span-2 text-right text-sm font-bold text-brand-orange-500">{{ e.xp }}</span>
        <span class="col-span-2 text-right text-sm font-bold">{{ e.wins }}</span>
        <span class="col-span-2 text-right text-sm text-slate-500">{{ e.accuracy }}%</span>
      </div>
    </div>
  </div>
</template>
