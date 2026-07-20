<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'

// Don't call Pinia stores at module top-level during SSR plugin order issues.
// Theme is applied via plugins/theme.client.ts + html class "dark".
onMounted(() => {
  try {
    useUiStore().init()
  } catch {
    // Pinia not ready — html.dark already set in nuxt.config
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <Toaster theme="dark" position="top-center" rich-colors close-button />
    </ClientOnly>
  </div>
</template>
