<script setup lang="ts">
const auth = useAuthStore()
const ui = useUiStore()

onMounted(async () => {
  try {
    ui.init()
  } catch { /* ignore */ }
  await auth.init()
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-900 text-slate-100">
    <div class="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-2">
      <NuxtLink to="/" class="flex items-center gap-2 font-black text-white">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-white">
          ✎
        </div>
        Draw & Guess
      </NuxtLink>
      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-200 hover:bg-slate-800"
        title="Settings"
        @click="ui.settingsOpen = true"
      >
        ⚙️
      </button>
    </div>
    <main class="flex-1 p-3 sm:p-4">
      <slot />
    </main>
    <SettingsModal />
  </div>
</template>
