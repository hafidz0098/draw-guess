<script setup lang="ts">
import { toast } from 'vue-sonner'

const auth = useAuthStore()
const tab = ref<'words' | 'stats' | 'reports' | 'shop' | 'quests'>('stats')

const newWord = reactive({ word_id: '', word_en: '', difficulty: 'easy', category: 'hewan' })

onMounted(async () => {
  await auth.init()
  // Allow local demo access; production checks is_admin
  if (auth.profile && !auth.profile.is_admin && !auth.profile.is_guest) {
    // still allow view for demo
  }
})

const stats = [
  { label: 'Total Users', value: '1,240', icon: '👥' },
  { label: 'Games Today', value: '86', icon: '🎮' },
  { label: 'Active Rooms', value: '12', icon: '🏠' },
  { label: 'Reports', value: '3', icon: '🚩' },
]

function addWord() {
  if (!newWord.word_id || !newWord.word_en) {
    toast.error('Isi kata ID & EN')
    return
  }
  toast.success(`Kata "${newWord.word_id}" ditambahkan (demo)`)
  newWord.word_id = ''
  newWord.word_en = ''
}
</script>

<template>
  <div class="page-container">
    <h1 class="section-title mb-2">Admin Panel</h1>
    <p class="mb-6 text-slate-500">Kelola kata, quest, shop, moderasi & statistik</p>

    <div class="mb-6 flex flex-wrap gap-2">
      <button
        v-for="t in [
          { id: 'stats', label: 'Statistik' },
          { id: 'words', label: 'Words' },
          { id: 'shop', label: 'Shop' },
          { id: 'quests', label: 'Quests' },
          { id: 'reports', label: 'Reports' },
        ]"
        :key="t.id"
        class="rounded-xl px-4 py-2 text-sm font-bold transition-colors"
        :class="tab === t.id ? 'bg-brand-orange-500 text-white' : 'bg-white shadow-card dark:bg-slate-800'"
        @click="tab = t.id as typeof tab"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Stats -->
    <div v-if="tab === 'stats'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="s in stats" :key="s.label" class="card p-5">
        <div class="text-2xl mb-2">{{ s.icon }}</div>
        <p class="text-2xl font-black">{{ s.value }}</p>
        <p class="text-sm text-slate-500">{{ s.label }}</p>
      </div>
    </div>

    <!-- Words CRUD -->
    <div v-else-if="tab === 'words'" class="card p-6 max-w-lg space-y-4">
      <h2 class="font-black text-lg">Tambah Kata</h2>
      <AppInput v-model="newWord.word_id" label="Kata (ID)" />
      <AppInput v-model="newWord.word_en" label="Word (EN)" />
      <div>
        <label class="label">Difficulty</label>
        <select v-model="newWord.difficulty" class="input">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div>
        <label class="label">Category slug</label>
        <input v-model="newWord.category" class="input">
      </div>
      <AppButton @click="addWord">Tambah Word</AppButton>
      <p class="text-xs text-slate-400">Production: insert ke Supabase `words` via service role API.</p>
    </div>

    <!-- Shop -->
    <div v-else-if="tab === 'shop'" class="card p-6">
      <h2 class="font-black text-lg mb-2">Kelola Shop Items</h2>
      <p class="text-sm text-slate-500 mb-4">CRUD shop_items di Supabase. Broadcast notifikasi saat item baru.</p>
      <AppButton size="sm" @click="toast('Broadcast: Item baru di shop!')">Broadcast New Item</AppButton>
    </div>

    <!-- Quests -->
    <div v-else-if="tab === 'quests'" class="card p-6">
      <h2 class="font-black text-lg mb-2">Daily Quests</h2>
      <ul class="space-y-2 text-sm">
        <li class="flex justify-between rounded-xl bg-surface-secondary px-3 py-2 dark:bg-slate-700">
          <span>Main 3 game</span><span class="font-bold">+40 XP</span>
        </li>
        <li class="flex justify-between rounded-xl bg-surface-secondary px-3 py-2 dark:bg-slate-700">
          <span>Menang 1 game</span><span class="font-bold">+50 XP</span>
        </li>
        <li class="flex justify-between rounded-xl bg-surface-secondary px-3 py-2 dark:bg-slate-700">
          <span>Tebak 10 gambar</span><span class="font-bold">+35 XP</span>
        </li>
      </ul>
    </div>

    <!-- Reports -->
    <div v-else-if="tab === 'reports'" class="card p-6">
      <h2 class="font-black text-lg mb-4">Moderasi Report</h2>
      <div class="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
        <div class="flex justify-between">
          <div>
            <p class="font-bold">Spam chat</p>
            <p class="text-xs text-slate-400">reported by User_A · pending</p>
          </div>
          <div class="flex gap-2">
            <AppButton size="sm" variant="outline" @click="toast.success('Dismissed')">Dismiss</AppButton>
            <AppButton size="sm" variant="danger" @click="toast.success('User banned')">Ban</AppButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
