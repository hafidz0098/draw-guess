<script setup lang="ts">
import { toast } from 'vue-sonner'
import { xpProgress } from '~/utils/scoring'
import { AVATAR_COLORS } from '~/utils/constants'

const auth = useAuthStore()

const nickname = ref('')
const bio = ref('')
const country = ref('')
const favoriteColor = ref('#F97316')

onMounted(async () => {
  await auth.init()
  if (!auth.isAuthenticated) {
    await auth.loginAsGuest()
  }
  if (auth.profile) {
    nickname.value = auth.profile.nickname
    bio.value = auth.profile.bio
    country.value = auth.profile.country
    favoriteColor.value = auth.profile.favorite_color
  }
})

const progress = computed(() => xpProgress(auth.profile?.xp ?? 0))

const accuracy = computed(() => {
  const p = auth.profile
  if (!p || !p.total_guesses) return 0
  return Math.round((p.correct_guesses / p.total_guesses) * 100)
})

async function save() {
  await auth.updateProfile({
    nickname: nickname.value,
    bio: bio.value,
    country: country.value,
    favorite_color: favoriteColor.value,
  })
  toast.success('Profil disimpan')
}

function randomAvatar() {
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  favoriteColor.value = color
  auth.updateProfile({ favorite_color: color, avatar_url: null })
  toast.success('Avatar diacak!')
}
</script>

<template>
  <div class="page-container max-w-2xl">
    <h1 class="section-title mb-6">Profile</h1>

    <div v-if="auth.profile" class="space-y-4">
      <div class="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
        <AppAvatar :src="auth.profile.avatar_url" :name="auth.profile.nickname" size="xl" :frame="auth.profile.avatar_frame" />
        <div class="flex-1 text-center sm:text-left">
          <h2 class="text-2xl font-black">{{ auth.profile.nickname }}</h2>
          <p class="text-sm text-slate-500">{{ auth.profile.title }} · {{ auth.isGuest ? 'Guest' : 'Member' }}</p>
          <div class="mt-3">
            <div class="mb-1 flex justify-between text-xs font-bold">
              <span>Level {{ progress.level }}</span>
              <span>{{ progress.current }}/{{ progress.needed }} XP</span>
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div class="h-full rounded-full bg-brand-orange-500 transition-all" :style="{ width: `${progress.ratio * 100}%` }" />
            </div>
          </div>
          <div class="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span class="badge-orange">{{ auth.profile.coins }} 🪙</span>
            <span class="badge-blue">{{ auth.profile.total_wins }} W</span>
            <span class="badge-purple">{{ auth.profile.xp }} XP</span>
          </div>
        </div>
        <AppButton size="sm" variant="outline" @click="randomAvatar">Random Avatar</AppButton>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card p-4 text-center">
          <p class="text-2xl font-black text-brand-orange-500">{{ auth.profile.total_wins }}</p>
          <p class="text-xs text-slate-500 font-bold">Wins</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-black text-brand-blue-500">{{ auth.profile.correct_guesses }}</p>
          <p class="text-xs text-slate-500 font-bold">Correct</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-black text-emerald-500">{{ accuracy }}%</p>
          <p class="text-xs text-slate-500 font-bold">Accuracy</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-black text-purple-500">{{ auth.profile.total_draws }}</p>
          <p class="text-xs text-slate-500 font-bold">Draws</p>
        </div>
      </div>

      <!-- Edit -->
      <form class="card space-y-4 p-6" @submit.prevent="save">
        <AppInput v-model="nickname" label="Nickname" :maxlength="20" />
        <AppInput v-model="bio" label="Bio" placeholder="Ceritakan dirimu..." :maxlength="200" />
        <AppInput v-model="country" label="Country" placeholder="Indonesia" :maxlength="60" />
        <div>
          <label class="label">Favorite Color</label>
          <input v-model="favoriteColor" type="color" class="h-10 w-20 cursor-pointer rounded-xl border-0">
        </div>
        <AppButton type="submit">Simpan</AppButton>
      </form>

      <!-- Achievements teaser -->
      <div class="card p-6">
        <h3 class="font-black mb-3">Achievements</h3>
        <div class="flex flex-wrap gap-2">
          <span class="badge-orange">🎯 Fast Guesser</span>
          <span class="badge-blue">🎨 Artist</span>
          <span class="badge-green">🔥 Streak</span>
          <span class="badge-purple">🏆 Winner</span>
        </div>
        <p class="mt-2 text-xs text-slate-400">Unlock lebih banyak dengan bermain!</p>
      </div>
    </div>
  </div>
</template>
