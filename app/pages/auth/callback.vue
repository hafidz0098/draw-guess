<script setup lang="ts">
onMounted(async () => {
  const auth = useAuthStore()
  await auth.init()
  navigateTo('/')
})
</script>

<template>
  <div class="flex min-h-[50vh] items-center justify-center">
    <p class="font-bold text-slate-500">Menyelesaikan login...</p>
  </div>
</template>
