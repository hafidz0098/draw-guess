<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { WordChoice } from '~/types'

const game = useGameStore()
const emit = defineEmits<{ selected: [word: string] }>()

const choices = computed((): WordChoice[] => {
  if (game.wordChoices?.length) return game.wordChoices as WordChoice[]
  return [
    { id: 'f1', text: 'Kucing', difficulty: 'easy' },
    { id: 'f2', text: 'Pesawat', difficulty: 'easy' },
    { id: 'f3', text: 'Pizza', difficulty: 'medium' },
  ]
})

function pick(w: WordChoice) {
  // Call store action
  game.selectWord(w)

  // Hard guarantee phase change via store action path
  if (game.phase !== 'drawing') {
    // Direct pinia patch as last resort
    game.$patch({
      phase: 'drawing',
      selectedWord: w.text,
    })
  }

  emit('selected', w.text)
  toast.success(`Mulai gambar: ${w.text}`)
}
</script>

<template>
  <div class="mx-auto max-w-lg rounded-2xl border border-slate-600 bg-slate-800 p-6 text-center shadow-card">
    <h2 class="mb-1 text-2xl font-black text-white">Pilih Kata</h2>
    <p class="mb-1 text-sm text-slate-400">Klik kata di bawah untuk mulai menggambar</p>
    <p class="mb-6 text-sm font-black text-orange-400">⏱ {{ game.timeLeft }}s</p>

    <div class="grid gap-3">
      <button
        v-for="w in choices"
        :key="w.id"
        type="button"
        class="w-full rounded-2xl border-2 border-slate-500 bg-slate-900 px-4 py-5 text-left transition hover:border-orange-500 hover:bg-slate-950 active:scale-[0.98]"
        @click.stop.prevent="pick(w)"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-2xl font-black text-white">{{ w.text }}</span>
          <span class="rounded-lg bg-slate-700 px-2 py-1 text-xs font-bold uppercase text-slate-300">
            {{ w.difficulty }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
