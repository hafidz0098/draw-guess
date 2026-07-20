<script setup lang="ts">
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import { WORD_SELECT_TIME } from '~/utils/constants'

const game = useGameStore()
const roomStore = useRoomStore()
const { phase, roundNumber, selectedWord } = storeToRefs(game)
const { room, isHost, sortedByScore } = storeToRefs(roomStore)

const channel = useRoomChannel(computed(() => room.value?.id))
const busy = ref(false)

const isLast = computed(
  () => roundNumber.value >= (room.value?.total_rounds || 3),
)

async function goNext() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await game.nextRound()
    if (!result) {
      toast.error('Gagal next round')
      return
    }

    if (result.done) {
      // Winner screen
      channel.sendGame('game_over', {
        winner_id: game.winnerId,
        scores: result.scores,
      })
      toast.success('Game selesai!')
      return
    }

    // Broadcast so ALL clients leave scoreboard → selecting
    await channel.sendGame('next_round', {
      roundNumber: result.roundNumber,
      drawerId: result.drawerId,
      timeLeft: WORD_SELECT_TIME,
      scores: result.scores,
    })

    toast.success(`Ronde ${result.roundNumber} — drawer diganti`)
  } catch (e) {
    console.error(e)
    toast.error(e instanceof Error ? e.message : 'Gagal next')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-slate-600 bg-slate-800 p-6 text-slate-100">
    <h2 class="mb-1 text-center text-2xl font-black text-white">
      Skor Ronde {{ roundNumber }}
    </h2>
    <p class="mb-4 text-center text-sm text-slate-400">
      Kata:
      <span class="font-black text-sky-400">{{ selectedWord || '—' }}</span>
    </p>

    <ul class="space-y-2">
      <li
        v-for="(m, i) in sortedByScore"
        :key="m.user_id"
        class="flex items-center gap-3 rounded-xl bg-slate-900/60 px-3 py-2"
      >
        <span
          class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
          :class="i === 0 ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-300'"
        >
          {{ i + 1 }}
        </span>
        <AppAvatar :src="m.profile?.avatar_url" :name="m.profile?.nickname || 'P'" size="sm" />
        <span class="flex-1 font-bold text-white">{{ m.profile?.nickname || 'Player' }}</span>
        <span class="font-black text-orange-400">{{ m.score }}</span>
      </li>
    </ul>

    <div class="mt-6 flex flex-col items-center gap-2">
      <button
        v-if="isHost"
        type="button"
        class="rounded-xl bg-orange-500 px-6 py-3 text-base font-black text-white hover:bg-orange-600 disabled:opacity-50"
        :disabled="busy"
        @click="goNext"
      >
        {{ busy ? 'Memuat...' : (isLast ? '🏆 Lihat Pemenang' : '▶ Ronde Berikutnya') }}
      </button>
      <p v-else class="text-sm font-bold text-slate-400">
        Menunggu host lanjut ke ronde berikutnya...
      </p>
      <p class="text-xs text-slate-500">phase={{ phase }}</p>
    </div>
  </div>
</template>
