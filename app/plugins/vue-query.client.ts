import { VueQueryPlugin, QueryClient, hydrate, dehydrate } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxt) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

  nuxt.vueApp.use(VueQueryPlugin, { queryClient })

  if (nuxt.payload.state?.vueQueryState) {
    hydrate(queryClient, nuxt.payload.state.vueQueryState)
  }

  nuxt.hooks.hook('app:rendered', () => {
    if (!nuxt.payload.state) nuxt.payload.state = {}
    nuxt.payload.state.vueQueryState = dehydrate(queryClient)
  })
})
