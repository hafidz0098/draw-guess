<script setup lang="ts">
const game = useGameStore()
const room = useRoomStore()
const { confettiBurst, popIn } = useGsap()
const { play } = useSound()
const root = ref<HTMLElement | null>(null)

const winner = computed(() =>
  room.members.find(m => m.user_id === game.winnerId),
)

onMounted(async () => {
  play('victory')
  await nextTick()
  if (root.value) {
    popIn(root.value)
    confettiBurst(root.value)
  }
})

function again() {
  game.playAgain()
  navigateTo(`/lobby/${room.room?.code}`)
}
</script>

<template>
  <div ref="root" class="card relative mx-auto max-w-md overflow-hidden p-8 text-center">
    <div class="mb-4 text-6xl">🏆</div>
    <h2 class="section-title mb-2">Pemenang!</h2>
    <div class="mb-6 flex flex-col items-center gap-2">
      <AppAvatar
        :src="winner?.profile?.avatar_url"
        :name="winner?.profile?.nickname || 'Winner'"
        size="xl"
      />
      <p class="text-2xl font-black text-brand-orange-500">
        {{ winner?.profile?.nickname || 'Player' }}
      </p>
      <p class="text-lg font-bold text-slate-500">{{ winner?.score ?? 0 }} poin</p>
    </div>

    <ul class="mb-6 space-y-1 text-left">
      <li
        v-for="(m, i) in room.sortedByScore"
        :key="m.user_id"
        class="flex justify-between rounded-lg px-3 py-1.5 text-sm"
        :class="i === 0 ? 'bg-amber-50 font-bold dark:bg-amber-900/20' : ''"
      >
        <span>#{{ i + 1 }} {{ m.profile?.nickname }}</span>
        <span>{{ m.score }}</span>
      </li>
    </ul>

    <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
      <AppButton v-if="room.isHost" @click="again">Main Lagi</AppButton>
      <AppButton variant="outline" @click="navigateTo('/')">Ke Home</AppButton>
    </div>
  </div>
</template>
