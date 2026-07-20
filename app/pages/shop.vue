<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { ShopItem } from '~/types'

const auth = useAuthStore()
const filter = ref<string>('all')

const demoItems: ShopItem[] = [
  { id: '1', slug: 'brush_neon', name_en: 'Neon Brush', name_id: 'Kuas Neon', description_en: '', description_id: 'Goresan neon cerah', item_type: 'brush', price_coins: 150, rarity: 'rare', preview_url: null, asset_data: {} },
  { id: '2', slug: 'brush_watercolor', name_en: 'Watercolor', name_id: 'Cat Air', description_en: '', description_id: 'Efek cat air', item_type: 'brush', price_coins: 200, rarity: 'epic', preview_url: null, asset_data: {} },
  { id: '3', slug: 'frame_gold', name_en: 'Gold Frame', name_id: 'Bingkai Emas', description_en: '', description_id: 'Bingkai avatar emas', item_type: 'frame', price_coins: 300, rarity: 'epic', preview_url: null, asset_data: {} },
  { id: '4', slug: 'theme_sunset', name_en: 'Sunset Theme', name_id: 'Tema Senja', description_en: '', description_id: 'Tema oranye hangat', item_type: 'color_theme', price_coins: 250, rarity: 'rare', preview_url: null, asset_data: {} },
  { id: '5', slug: 'title_pro', name_en: 'Pro Drawer', name_id: 'Pro Drawer', description_en: '', description_id: 'Gelar Pro Drawer', item_type: 'title', price_coins: 200, rarity: 'rare', preview_url: null, asset_data: {} },
  { id: '6', slug: 'emote_fire', name_en: 'Fire Emote', name_id: 'Emote Api', description_en: '', description_id: '🔥 emote', item_type: 'emote', price_coins: 80, rarity: 'common', preview_url: null, asset_data: {} },
  { id: '7', slug: 'cursor_pencil', name_en: 'Pencil Cursor', name_id: 'Kursor Pensil', description_en: '', description_id: 'Kursor pensil', item_type: 'cursor', price_coins: 100, rarity: 'common', preview_url: null, asset_data: {} },
  { id: '8', slug: 'trail_stars', name_en: 'Star Trail', name_id: 'Jejak Bintang', description_en: '', description_id: 'Jejak bintang', item_type: 'trail', price_coins: 180, rarity: 'rare', preview_url: null, asset_data: {} },
]

const types = [
  { id: 'all', label: 'Semua' },
  { id: 'brush', label: 'Brush' },
  { id: 'frame', label: 'Frame' },
  { id: 'color_theme', label: 'Theme' },
  { id: 'title', label: 'Title' },
  { id: 'emote', label: 'Emote' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'trail', label: 'Trail' },
]

const filtered = computed(() =>
  filter.value === 'all' ? demoItems : demoItems.filter(i => i.item_type === filter.value),
)

const rarityClass = (r: string) => ({
  common: 'badge-blue',
  rare: 'badge-purple',
  epic: 'badge-orange',
  legendary: 'bg-amber-100 text-amber-700 badge',
}[r] || 'badge-blue')

const owned = ref<Set<string>>(new Set())

onMounted(() => auth.init())

async function buy(item: ShopItem) {
  if (!auth.profile) {
    await auth.loginAsGuest()
  }
  if (owned.value.has(item.id)) {
    toast('Sudah dimiliki')
    return
  }
  if ((auth.profile?.coins ?? 0) < item.price_coins) {
    toast.error('Koin tidak cukup')
    return
  }
  await auth.updateProfile({ coins: (auth.profile!.coins) - item.price_coins })
  owned.value.add(item.id)
  toast.success(`Membeli ${item.name_id}!`)
}
</script>

<template>
  <div class="page-container">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="section-title">Shop</h1>
        <p class="text-slate-500">Beli brush, frame, theme & lebih banyak</p>
      </div>
      <span class="badge-orange text-base px-3 py-1">{{ auth.profile?.coins ?? 0 }} 🪙</span>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="t in types"
        :key="t.id"
        class="rounded-xl px-3 py-1.5 text-sm font-bold transition-colors"
        :class="filter === t.id ? 'bg-brand-orange-500 text-white' : 'bg-white shadow-card dark:bg-slate-800'"
        @click="filter = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div v-for="item in filtered" :key="item.id" class="card-hover flex flex-col p-4">
        <div class="mb-3 flex h-24 items-center justify-center rounded-xl bg-surface-secondary text-4xl dark:bg-slate-700/50">
          {{ item.item_type === 'emote' ? '🔥' : item.item_type === 'brush' ? '🖌️' : item.item_type === 'frame' ? '🖼️' : item.item_type === 'title' ? '🏷️' : '✨' }}
        </div>
        <div class="mb-1 flex items-center justify-between gap-2">
          <h3 class="font-black">{{ item.name_id }}</h3>
          <span :class="rarityClass(item.rarity)">{{ item.rarity }}</span>
        </div>
        <p class="mb-3 flex-1 text-sm text-slate-500">{{ item.description_id }}</p>
        <AppButton
          size="sm"
          :variant="owned.has(item.id) ? 'outline' : 'primary'"
          :disabled="owned.has(item.id)"
          @click="buy(item)"
        >
          {{ owned.has(item.id) ? 'Dimiliki' : `${item.price_coins} 🪙` }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
