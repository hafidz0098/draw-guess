<script setup lang="ts">
const auth = useAuthStore()
const ui = useUiStore()

const showAuth = ref(false)
const guestName = ref('')
const mobileOpen = ref(false)

const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/shop', label: 'Shop' },
  { to: '/quests', label: 'Quests' },
  { to: '/history', label: 'History' },
]

async function guestLogin() {
  await auth.loginAsGuest(guestName.value || undefined)
  showAuth.value = false
}

async function googleLogin() {
  try {
    await auth.loginWithGoogle()
  } catch {
    await guestLogin()
  }
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-slate-700 bg-slate-900 text-slate-100">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2" @click="mobileOpen = false">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white">
          ✎
        </div>
        <span class="text-lg font-black tracking-tight text-white sm:text-xl">
          Draw <span class="text-orange-500">&</span> Guess
        </span>
      </NuxtLink>

      <nav class="hidden flex-1 items-center justify-center gap-1 sm:flex">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"
          active-class="!bg-orange-950 !text-orange-300"
        >
          {{ link.label }}
        </NuxtLink>
        <NuxtLink
          v-if="auth.isAdmin"
          to="/admin"
          class="rounded-lg px-3 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"
        >
          Admin
        </NuxtLink>
      </nav>

      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-100 hover:bg-slate-800"
          title="Settings"
          @click="ui.settingsOpen = true"
        >
          ⚙️
        </button>

        <template v-if="auth.isAuthenticated && auth.profile">
          <NuxtLink
            to="/profile"
            class="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-800"
          >
            <AppAvatar :src="auth.profile.avatar_url" :name="auth.profile.nickname" size="sm" />
            <div class="hidden text-left md:block">
              <p class="text-sm font-bold leading-tight text-white">
                {{ auth.profile.nickname }}
              </p>
              <p class="text-xs text-slate-400">
                Lv.{{ auth.profile.level }} · {{ auth.profile.coins }}🪙
              </p>
            </div>
          </NuxtLink>
        </template>
        <AppButton v-else size="sm" @click="showAuth = true">
          Login
        </AppButton>

        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl text-white hover:bg-slate-800 sm:hidden"
          aria-label="Menu"
          @click="mobileOpen = !mobileOpen"
        >
          {{ mobileOpen ? '✕' : '☰' }}
        </button>
      </div>
    </div>

    <div
      v-show="mobileOpen"
      class="border-t border-slate-700 bg-slate-900 px-4 py-3 sm:hidden"
    >
      <nav class="flex flex-col gap-1">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-xl px-3 py-3 text-sm font-bold text-slate-100 hover:bg-slate-800"
          @click="mobileOpen = false"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
    </div>

    <AppModal v-model="showAuth" title="Masuk ke Game" size="sm">
      <div class="space-y-4">
        <AppInput v-model="guestName" label="Nickname" placeholder="Pilih nama keren..." :maxlength="20" />
        <AppButton block :loading="auth.loading" @click="guestLogin">
          Main sebagai Guest
        </AppButton>
        <AppButton variant="outline" block @click="googleLogin">
          Login dengan Google
        </AppButton>
      </div>
    </AppModal>

    <SettingsModal />
  </header>
</template>
