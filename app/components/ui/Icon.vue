<script setup lang="ts">
/**
 * Iconify wrapper — loads icons on demand via Iconify API / CSS.
 * Usage: <Icon name="mdi:home" class="h-5 w-5" />
 */
const props = defineProps<{ name: string }>()

const iconHtml = ref('')

async function load() {
  if (!import.meta.client || !props.name) return
  try {
    const [prefix, icon] = props.name.split(':')
    if (!prefix || !icon) return
    const res = await fetch(`https://api.iconify.design/${prefix}/${icon}.svg`)
    if (res.ok) {
      iconHtml.value = await res.text()
    }
  } catch {
    iconHtml.value = ''
  }
}

watch(() => props.name, load, { immediate: true })
</script>

<template>
  <span
    class="inline-flex items-center justify-center [&>svg]:h-full [&>svg]:w-full"
    v-html="iconHtml"
  />
</template>
