<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
  MAX_PLAYERS_OPTIONS,
  ROUND_OPTIONS,
  DRAW_TIME_OPTIONS,
  DIFFICULTY_OPTIONS,
  LANGUAGE_OPTIONS,
} from '~/utils/constants'
import type { Category, CreateRoomInput } from '~/types'

const auth = useAuthStore()
const room = useRoomStore()

const form = reactive<CreateRoomInput>({
  name: '',
  password: '',
  is_private: false,
  max_players: 8,
  total_rounds: 3,
  language: 'id',
  draw_time: 60,
  word_difficulty: 'medium',
  word_category: null,
})

const categories = ref<Category[]>([])

onMounted(async () => {
  await auth.init()
  try {
    await auth.ensureSupabaseUser()
  } catch {
    await auth.loginAsGuest()
  }
  if (auth.profile) {
    form.name = `Room ${auth.profile.nickname}`
  }

  const client = useSupabase()
  if (client) {
    const { data } = await client
      .from('categories')
      .select('id, name_en, name_id, slug, icon')
      .order('name_id')
    if (data) categories.value = data as Category[]
  }
})

async function submit() {
  try {
    await auth.ensureSupabaseUser(auth.profile?.nickname)
    if (!auth.hasSupabaseSession && isSupabaseConfigured()) {
      toast.error('Gagal login ke Supabase. Cek SUPABASE_SERVICE_ROLE_KEY di .env & restart dev server')
      return
    }
    // Reset game state from previous match
    try { useGameStore().reset() } catch { /* ignore */ }
    const created = await room.createRoom(form)
    toast.success(`Room ${created.code} dibuat! Bagikan kode ke teman.`)
    await navigateTo(`/lobby/${created.code}`)
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string } })?.data?.message
      || (e instanceof Error ? e.message : 'Gagal membuat room')
    toast.error(msg)
    console.error('[create room]', e)
  }
}
</script>

<template>
  <div class="page-container max-w-xl">
    <h1 class="section-title mb-6">Buat Room</h1>

    <form class="card space-y-5 p-6" @submit.prevent="submit">
      <AppInput v-model="form.name" label="Nama Room" placeholder="Room seru..." :maxlength="40" />

      <AppInput
        v-model="form.password"
        label="Password (opsional)"
        type="password"
        placeholder="Kosongkan jika public"
      />

      <div class="flex items-center justify-between">
        <div>
          <p class="font-bold text-sm">Private Room</p>
          <p class="text-xs text-slate-500">Hanya bisa join via kode/link</p>
        </div>
        <input v-model="form.is_private" type="checkbox" class="h-5 w-5 accent-brand-orange-500">
      </div>

      <div>
        <label class="label">Max Player</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="n in MAX_PLAYERS_OPTIONS"
            :key="n"
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-bold transition-colors"
            :class="form.max_players === n ? 'bg-brand-orange-500 text-white' : 'bg-surface-tertiary text-slate-600 dark:bg-slate-700 dark:text-slate-200'"
            @click="form.max_players = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">Jumlah Ronde</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="n in ROUND_OPTIONS"
            :key="n"
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-bold transition-colors"
            :class="form.total_rounds === n ? 'bg-brand-blue-500 text-white' : 'bg-surface-tertiary text-slate-600 dark:bg-slate-700'"
            @click="form.total_rounds = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">Bahasa</label>
        <div class="flex gap-2">
          <button
            v-for="l in LANGUAGE_OPTIONS"
            :key="l.value"
            type="button"
            class="rounded-xl px-4 py-2 text-sm font-bold transition-colors"
            :class="form.language === l.value ? 'bg-brand-orange-500 text-white' : 'bg-surface-tertiary dark:bg-slate-700'"
            @click="form.language = l.value"
          >
            {{ l.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">Waktu Menggambar</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="n in DRAW_TIME_OPTIONS"
            :key="n"
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-bold transition-colors"
            :class="form.draw_time === n ? 'bg-brand-blue-500 text-white' : 'bg-surface-tertiary dark:bg-slate-700'"
            @click="form.draw_time = n"
          >
            {{ n }}s
          </button>
        </div>
      </div>

      <div>
        <label class="label">Kesulitan Kata</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="d in DIFFICULTY_OPTIONS"
            :key="d"
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-bold capitalize transition-colors"
            :class="form.word_difficulty === d ? 'bg-brand-orange-500 text-white' : 'bg-surface-tertiary dark:bg-slate-700'"
            @click="form.word_difficulty = d"
          >
            {{ d }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">Kategori</label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-xl px-3 py-2 text-sm font-bold transition-colors"
            :class="!form.word_category ? 'bg-brand-orange-500 text-white' : 'bg-surface-tertiary text-slate-600 dark:bg-slate-700 dark:text-slate-200'"
            @click="form.word_category = null"
          >
            Semua
          </button>
          <button
            v-for="c in categories"
            :key="c.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors"
            :class="form.word_category === c.slug ? 'bg-brand-orange-500 text-white' : 'bg-surface-tertiary text-slate-600 dark:bg-slate-700 dark:text-slate-200'"
            @click="form.word_category = c.slug"
          >
            <Icon :name="`mdi:${c.icon}`" class="h-4 w-4" />
            {{ form.language === 'en' ? c.name_en : c.name_id }}
          </button>
        </div>
      </div>

      <div class="flex gap-3 pt-2">
        <AppButton type="button" variant="outline" @click="navigateTo('/')">Batal</AppButton>
        <AppButton type="submit" class="flex-1" :loading="room.loading">Buat Room</AppButton>
      </div>
    </form>
  </div>
</template>
