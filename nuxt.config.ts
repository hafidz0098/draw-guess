// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
  ],

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Draw & Guess',
      htmlAttrs: {
        lang: 'id',
        class: 'dark',
      },
      meta: [
        { name: 'description', content: 'Multiplayer online draw and guess game — real-time fun with friends!' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'theme-color', content: '#0f172a' },
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap',
        },
      ],
      script: [
        {
          key: 'dg-theme-init',
          innerHTML: `(function(){var e=document.documentElement;e.classList.add('dark');e.style.colorScheme='dark';e.style.backgroundColor='#0f172a';try{localStorage.setItem('dg_theme','dark')}catch(x){}})();`,
          tagPosition: 'head',
        },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'layout', mode: 'out-in' },
  },

  runtimeConfig: {
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
  },

  vite: {
    optimizeDeps: {
      include: ['konva', 'vue-konva', 'gsap', 'dayjs', 'nanoid', 'zod'],
    },
  },

  nitro: {
    compressPublicAssets: true,
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
})
