import { defineStore } from 'pinia'
import type { Profile, UserSettings } from '~/types'
import { generateGuestNickname } from '~/utils/room'

const defaultSettings: UserSettings = {
  sound: true,
  music: true,
  sound_volume: 0.7,
  music_volume: 0.4,
  language: 'id',
  theme: 'light',
  cursor: 'default',
  brush: 'default',
  canvas_theme: 'white',
  ui_theme: 'default',
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string; email?: string } | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isGuest = computed(() => profile.value?.is_guest ?? false)
  const isAdmin = computed(() => profile.value?.is_admin ?? false)
  const nickname = computed(() => profile.value?.nickname ?? '')
  const settings = computed(() => profile.value?.settings ?? defaultSettings)

  /** True when user has a real Supabase JWT (can write to DB) */
  const hasSupabaseSession = ref(false)

  async function init() {
    if (initialized.value) return
    loading.value = true
    try {
      const client = useSupabase()
      if (!client) {
        restoreLocalGuest()
        initialized.value = true
        return
      }

      const { data: { session } } = await client.auth.getSession()
      if (session?.user) {
        user.value = { id: session.user.id, email: session.user.email }
        hasSupabaseSession.value = true
        await fetchProfile()
        if (!profile.value) {
          await ensureProfile(session.user.id, session.user.user_metadata?.nickname as string | undefined)
        }
      }

      client.auth.onAuthStateChange(async (event, sess) => {
        if (sess?.user) {
          user.value = { id: sess.user.id, email: sess.user.email }
          hasSupabaseSession.value = true
          await fetchProfile()
        } else if (event === 'SIGNED_OUT') {
          user.value = null
          profile.value = null
          hasSupabaseSession.value = false
        }
      })
    } catch {
      restoreLocalGuest()
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  function restoreLocalGuest() {
    if (import.meta.server) return
    const raw = localStorage.getItem('dg_guest')
    if (raw) {
      try {
        profile.value = JSON.parse(raw) as Profile
        user.value = { id: profile.value.id }
        hasSupabaseSession.value = false
      } catch { /* ignore */ }
    }
  }

  async function ensureProfile(userId: string, nickname?: string) {
    const client = useSupabase()
    if (!client) return
    const name = nickname?.trim() || generateGuestNickname()
    await client.from('profiles').upsert({
      id: userId,
      nickname: name,
      is_guest: true,
    }, { onConflict: 'id' })
    await fetchProfile()
  }

  async function fetchProfile() {
    if (!user.value) return
    const client = useSupabase()
    if (!client) return

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .maybeSingle()

    if (!error && data) {
      profile.value = data as Profile
    }
  }

  async function getAccessToken(): Promise<string | null> {
    const client = useSupabase()
    if (!client) return null
    const { data: { session } } = await client.auth.getSession()
    return session?.access_token ?? null
  }

  /**
   * Ensure real Supabase session exists.
   * Prefer anonymous → server guest endpoint → never use fake UUID for DB writes.
   */
  async function ensureSupabaseUser(nickname?: string): Promise<void> {
    const client = useSupabase()
    if (!client) {
      await loginAsGuestLocal(nickname)
      return
    }

    const { data: { session } } = await client.auth.getSession()
    if (session?.user) {
      user.value = { id: session.user.id, email: session.user.email }
      hasSupabaseSession.value = true
      await fetchProfile()
      if (!profile.value) {
        await ensureProfile(session.user.id, nickname)
      } else if (nickname?.trim() && profile.value.nickname !== nickname.trim()) {
        await client.from('profiles').update({ nickname: nickname.trim() }).eq('id', session.user.id)
        profile.value.nickname = nickname.trim()
      }
      return
    }

    await loginAsGuest(nickname)
  }

  async function loginAsGuest(nickname?: string) {
    loading.value = true
    try {
      const name = nickname?.trim() || generateGuestNickname()
      const client = useSupabase()

      if (client) {
        // 1) Anonymous auth (if enabled in Supabase dashboard)
        try {
          const { data, error } = await client.auth.signInAnonymously({
            options: { data: { nickname: name, is_guest: true } },
          })
          if (!error && data.user && data.session) {
            user.value = { id: data.user.id }
            hasSupabaseSession.value = true
            await ensureProfile(data.user.id, name)
            if (profile.value) {
              profile.value.nickname = name
              profile.value.is_guest = true
            }
            return
          }
        } catch {
          // continue
        }

        // 2) Server-side guest (service role) — reliable path
        try {
          const res = await $fetch<{
            user: { id: string; email?: string }
            session: {
              access_token: string
              refresh_token: string
            }
            nickname: string
          }>('/api/auth/guest', {
            method: 'POST',
            body: { nickname: name },
          })

          const { error: setErr } = await client.auth.setSession({
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
          })
          if (setErr) throw setErr

          user.value = { id: res.user.id, email: res.user.email }
          hasSupabaseSession.value = true
          await fetchProfile()
          if (!profile.value) {
            await ensureProfile(res.user.id, res.nickname || name)
          }
          return
        } catch (e: unknown) {
          console.error('[auth] guest server failed', e)
          // fall through to local only as last resort
        }
      }

      await loginAsGuestLocal(name)
    } finally {
      loading.value = false
    }
  }

  async function loginAsGuestLocal(nickname?: string) {
    const name = nickname?.trim() || generateGuestNickname()
    const id = crypto.randomUUID()
    const guest: Profile = {
      id,
      nickname: name,
      bio: '',
      country: '',
      avatar_url: null,
      avatar_frame: 'default',
      favorite_color: '#F97316',
      level: 1,
      xp: 0,
      coins: 100,
      total_wins: 0,
      total_losses: 0,
      total_guesses: 0,
      total_draws: 0,
      correct_guesses: 0,
      title: 'Newbie',
      is_guest: true,
      is_admin: false,
      is_banned: false,
      settings: { ...defaultSettings },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    profile.value = guest
    user.value = { id }
    hasSupabaseSession.value = false
    if (import.meta.client) {
      localStorage.setItem('dg_guest', JSON.stringify(guest))
    }
  }

  async function loginWithGoogle() {
    const client = useSupabase()
    if (!client) throw new Error('Supabase not configured')
    const config = useRuntimeConfig()
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${config.public.appUrl}/auth/callback`,
      },
    })
    if (error) throw error
  }

  async function logout() {
    const client = useSupabase()
    if (client) await client.auth.signOut()
    user.value = null
    profile.value = null
    hasSupabaseSession.value = false
    if (import.meta.client) localStorage.removeItem('dg_guest')
  }

  async function updateProfile(patch: Partial<Profile>) {
    if (!profile.value || !user.value) return
    profile.value = { ...profile.value, ...patch, updated_at: new Date().toISOString() }

    if (import.meta.client && !hasSupabaseSession.value) {
      localStorage.setItem('dg_guest', JSON.stringify(profile.value))
    }

    const client = useSupabase()
    if (client && hasSupabaseSession.value) {
      await client.from('profiles').update(patch).eq('id', user.value.id)
    }
  }

  async function updateSettings(patch: Partial<UserSettings>) {
    if (!profile.value) return
    const next = { ...profile.value.settings, ...patch }
    await updateProfile({ settings: next })
  }

  return {
    user,
    profile,
    loading,
    initialized,
    isAuthenticated,
    isGuest,
    isAdmin,
    nickname,
    settings,
    hasSupabaseSession,
    init,
    fetchProfile,
    getAccessToken,
    ensureSupabaseUser,
    loginAsGuest,
    loginWithGoogle,
    logout,
    updateProfile,
    updateSettings,
  }
})
