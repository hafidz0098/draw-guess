<script setup lang="ts">
const room = useRoomStore()
const game = useGameStore()

defineProps<{
  showScore?: boolean
  compact?: boolean
}>()
</script>

<template>
  <div class="card overflow-hidden">
    <div class="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
      <h3 class="text-sm font-black text-slate-700 dark:text-slate-200">
        Pemain ({{ room.connectedPlayers.length }}/{{ room.room?.max_players || 8 }})
      </h3>
    </div>
    <ul class="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-80 overflow-y-auto">
      <li
        v-for="(m, i) in (showScore ? room.sortedByScore : room.members)"
        :key="m.id"
        class="flex items-center gap-2 px-3 py-2"
        :class="{
          'bg-brand-orange-50 dark:bg-brand-orange-900/20': m.user_id === game.drawerId,
          'opacity-50': !m.is_connected,
        }"
      >
        <span v-if="showScore" class="w-5 text-center text-xs font-black text-slate-400">{{ i + 1 }}</span>
        <AppAvatar
          :src="m.profile?.avatar_url"
          :name="m.profile?.nickname || 'P'"
          size="sm"
          :online="m.is_connected"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1">
            <p class="truncate text-sm font-bold">{{ m.profile?.nickname || 'Player' }}</p>
            <span v-if="m.role === 'host'" class="badge-orange">Host</span>
            <span v-if="m.role === 'spectator'" class="badge-blue">Spec</span>
            <span v-if="m.user_id === game.drawerId" class="badge-purple">🎨</span>
            <span v-if="game.correctGuessers.has(m.user_id)" class="text-emerald-500">✓</span>
          </div>
          <p v-if="!compact" class="text-xs text-slate-400">
            Lv.{{ m.profile?.level ?? 1 }}
            <span v-if="m.ping"> · {{ m.ping }}ms</span>
            <span v-if="!m.is_ready && room.room?.status === 'waiting'" class="text-amber-500"> · Not ready</span>
            <span v-else-if="m.is_ready && room.room?.status === 'waiting'" class="text-emerald-500"> · Ready</span>
          </p>
        </div>
        <span v-if="showScore" class="text-sm font-black text-brand-orange-500">{{ m.score }}</span>
      </li>
    </ul>
  </div>
</template>
