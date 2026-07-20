<script setup lang="ts">
const auth = useAuthStore()

onMounted(async () => {
  try {
    useUiStore().init()
  } catch { /* ignore */ }
  await auth.init()
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-900 text-slate-100">
    <AppHeader />
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-slate-700 py-4 text-center text-xs text-slate-500">
      Draw & Guess · Made with Nuxt + Supabase
    </footer>
  </div>
</template>
