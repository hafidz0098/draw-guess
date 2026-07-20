<script setup lang="ts">
import { initials, randomAvatarColor } from '~/utils/room'

const props = withDefaults(defineProps<{
  src?: string | null
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  frame?: string
  online?: boolean
}>(), {
  size: 'md',
  name: 'P',
})

const sizeClass = computed(() => ({
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
}[props.size]))

const bg = computed(() => randomAvatarColor(props.name || 'P'))
</script>

<template>
  <div class="relative inline-flex shrink-0">
    <div
      class="overflow-hidden rounded-full font-black text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-800"
      :class="[sizeClass, frame === 'gold' && 'ring-2 ring-amber-400', frame === 'rainbow' && 'ring-2 ring-pink-400']"
      :style="!src ? { backgroundColor: bg } : undefined"
    >
      <img v-if="src" :src="src" :alt="name" class="h-full w-full object-cover">
      <span v-else>{{ initials(name) }}</span>
    </div>
    <span
      v-if="online !== undefined"
      class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-800"
      :class="online ? 'bg-emerald-400' : 'bg-slate-300'"
    />
  </div>
</template>
