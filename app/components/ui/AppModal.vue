<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg'
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

function close() {
  emit('update:modelValue', false)
}

const { popIn } = useGsap()
const panel = ref<HTMLElement | null>(null)

watch(() => props.modelValue, async (v) => {
  if (v) {
    await nextTick()
    if (panel.value) popIn(panel.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="absolute inset-0 bg-black/60" @click="close" />
      <div
        ref="panel"
        class="relative z-10 w-full rounded-2xl border border-slate-700 bg-slate-800 p-6 text-slate-100 shadow-card"
        :class="{
          'max-w-sm': size === 'sm' || !size,
          'max-w-md': size === 'md',
          'max-w-lg': size === 'lg',
        }"
      >
        <div v-if="title" class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-black text-white">{{ title }}</h2>
          <button type="button" class="rounded-lg p-1 text-slate-300 hover:bg-slate-700" aria-label="Close" @click="close">
            ✕
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
