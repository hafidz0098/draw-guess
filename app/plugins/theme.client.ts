/**
 * Apply dark theme once Pinia is available.
 * Note: do NOT use enforce:'pre' — that runs before Pinia and causes getActivePinia() errors.
 */
export default defineNuxtPlugin({
  name: 'dg-theme',
  // Wait until Vue app + pinia are ready
  setup(nuxtApp) {
    // Ensure we're on client with pinia installed
    if (!nuxtApp.$pinia && !nuxtApp.vueApp.config.globalProperties.$pinia) {
      // Fallback: set DOM dark class without store
      if (import.meta.client) {
        document.documentElement.classList.add('dark')
        document.documentElement.style.colorScheme = 'dark'
        document.documentElement.style.backgroundColor = '#0f172a'
      }
      return
    }

    try {
      const ui = useUiStore()
      ui.init()
    } catch {
      if (import.meta.client) {
        document.documentElement.classList.add('dark')
        document.documentElement.style.colorScheme = 'dark'
      }
    }
  },
})
