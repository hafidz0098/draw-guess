import { defineStore } from 'pinia'

/** App is dark-mode only — no light theme. */
export const useUiStore = defineStore('ui', () => {
  const darkMode = ref(true)
  const sidebarOpen = ref(false)
  const settingsOpen = ref(false)
  const soundEnabled = ref(true)
  const musicEnabled = ref(true)
  const soundVolume = ref(0.7)
  const musicVolume = ref(0.4)
  const ready = ref(false)

  function applyDark() {
    if (import.meta.server) return
    const root = document.documentElement
    root.classList.add('dark')
    root.setAttribute('data-theme', 'dark')
    root.style.colorScheme = 'dark'
    root.style.backgroundColor = '#0f172a'
    if (document.body) {
      document.body.style.backgroundColor = '#0f172a'
      document.body.style.color = '#f1f5f9'
    }
    try {
      localStorage.setItem('dg_theme', 'dark')
    } catch { /* ignore */ }
  }

  function init() {
    if (import.meta.server) return
    darkMode.value = true
    applyDark()

    const sound = localStorage.getItem('dg_sound')
    if (sound !== null) soundEnabled.value = sound === '1'
    const music = localStorage.getItem('dg_music')
    if (music !== null) musicEnabled.value = music === '1'
    ready.value = true
  }

  function setSound(v: boolean) {
    soundEnabled.value = v
    if (import.meta.client) localStorage.setItem('dg_sound', v ? '1' : '0')
  }

  function setMusic(v: boolean) {
    musicEnabled.value = v
    if (import.meta.client) localStorage.setItem('dg_music', v ? '1' : '0')
  }

  return {
    darkMode,
    sidebarOpen,
    settingsOpen,
    soundEnabled,
    musicEnabled,
    soundVolume,
    musicVolume,
    ready,
    init,
    setSound,
    setMusic,
  }
})
