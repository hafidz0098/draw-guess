<script setup lang="ts">
const ui = useUiStore()
const auth = useAuthStore()

const open = computed({
  get: () => ui.settingsOpen,
  set: (v: boolean) => { ui.settingsOpen = v },
})
</script>

<template>
  <AppModal v-model="open" title="Pengaturan" size="md">
    <div class="space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-bold text-slate-100">Efek Suara</p>
          <p class="text-xs text-slate-400">SFX game</p>
        </div>
        <input
          type="checkbox"
          class="h-5 w-5 accent-orange-500"
          :checked="ui.soundEnabled"
          @change="ui.setSound(($event.target as HTMLInputElement).checked)"
        >
      </div>

      <div class="flex items-center justify-between">
        <div>
          <p class="font-bold text-slate-100">Musik</p>
          <p class="text-xs text-slate-400">Background music</p>
        </div>
        <input
          type="checkbox"
          class="h-5 w-5 accent-orange-500"
          :checked="ui.musicEnabled"
          @change="ui.setMusic(($event.target as HTMLInputElement).checked)"
        >
      </div>

      <div>
        <label class="label text-slate-300">Volume Suara</label>
        <input v-model.number="ui.soundVolume" type="range" min="0" max="1" step="0.05" class="w-full accent-orange-500">
      </div>

      <div>
        <label class="label text-slate-300">Volume Musik</label>
        <input v-model.number="ui.musicVolume" type="range" min="0" max="1" step="0.05" class="w-full accent-blue-500">
      </div>

      <div v-if="auth.isAuthenticated">
        <AppButton variant="outline" block @click="auth.logout(); open = false">
          Logout
        </AppButton>
      </div>
    </div>
  </AppModal>
</template>
