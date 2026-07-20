<script setup lang="ts">
const auth = useAuthStore()
const equipped = ref('default')

const items = [
  { id: 'default', name: 'Default Brush', type: 'brush', emoji: '✏️' },
  { id: 'neon', name: 'Neon Brush', type: 'brush', emoji: '✨' },
  { id: 'gold', name: 'Gold Frame', type: 'frame', emoji: '🖼️' },
  { id: 'pro', name: 'Pro Drawer', type: 'title', emoji: '🏷️' },
]

onMounted(() => auth.init())

function equip(id: string) {
  equipped.value = id
}
</script>

<template>
  <div class="page-container max-w-2xl">
    <h1 class="section-title mb-2">Inventory</h1>
    <p class="mb-6 text-slate-500">Item yang kamu miliki</p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="card flex items-center gap-3 p-4"
        :class="equipped === item.id ? 'ring-2 ring-brand-orange-400' : ''"
      >
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary text-2xl dark:bg-slate-700">
          {{ item.emoji }}
        </div>
        <div class="flex-1">
          <p class="font-black">{{ item.name }}</p>
          <p class="text-xs text-slate-400 capitalize">{{ item.type }}</p>
        </div>
        <AppButton size="sm" :variant="equipped === item.id ? 'outline' : 'primary'" @click="equip(item.id)">
          {{ equipped === item.id ? 'Equipped' : 'Equip' }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
