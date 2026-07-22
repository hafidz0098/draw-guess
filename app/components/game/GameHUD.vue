<script setup lang="ts">
const game = useGameStore()
const room = useRoomStore()

const drawerName = computed(() => {
  const m = room.members.find(x => x.user_id === game.drawerId)
  return m?.profile?.nickname || (game.isDrawer ? 'Kamu' : '...')
})

const hintChars = computed(() => {
  if (game.wordHint.length) return game.wordHint
  if (game.selectedWord && !game.isDrawer) {
    return game.selectedWord.split('').map(c => (c === ' ' ? ' ' : '_'))
  }
  return []
})
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex items-center gap-3">
      <span class="rounded-lg bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-300">
        Ronde {{ game.roundNumber }}/{{ room.room?.total_rounds || '?' }}
      </span>
      <span class="text-sm text-slate-400">
        Drawer: <strong class="text-white">{{ drawerName }}</strong>
      </span>
    </div>

    <div
      class="flex items-center gap-1 rounded-xl px-3 py-1.5 font-black"
      :class="game.timeLeft <= 10 ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-300'"
    >
      ⏱ {{ game.timeLeft }}s
    </div>

    <!-- HINT FOR GUESSER -->
    <div v-if="game.wordHint?.length && !game.isDrawer" class="flex flex-col items-center gap-1 bg-slate-800/70 px-3 py-2 rounded-xl">
      <div class="text-xs text-slate-400 flex items-center gap-1">
        👀 Hint
        <button
          @click="game.revealAllHint"
          class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-0.5 rounded font-bold transition"
        >
          Lihat Jawaban
        </button>
      </div>
      <div class="font-mono text-xl tracking-widest text-sky-400">{{ game.hintDisplay }}</div>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-1">
      <template v-if="game.isDrawer && game.selectedWord">
        <span class="mr-2 text-sm font-bold text-slate-400">Gambar:</span>
        <span class="text-lg font-black text-orange-400">{{ game.selectedWord }}</span>
      </template>
      <template v-else-if="game.phase === 'drawing'">
        <span
          v-for="(ch, i) in hintChars"
          :key="i"
          class="inline-flex h-10 w-8 items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-700 text-lg font-black text-slate-200 sm:h-12 sm:w-10"
          :class="ch === ' ' ? '!w-3 !border-0 !bg-transparent' : ''"
        >
          {{ ch === ' ' ? '' : ch }}
        </span>
      </template>
    </div>
  </div>
</template>
