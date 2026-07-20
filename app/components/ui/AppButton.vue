<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  block: false,
  disabled: false,
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[
      {
        'btn-primary': variant === 'primary',
        'btn-secondary': variant === 'secondary',
        'btn-outline': variant === 'outline',
        'btn-ghost': variant === 'ghost',
        'btn-danger': variant === 'danger',
        'btn-sm': size === 'sm',
        'btn-lg': size === 'lg',
        'w-full': block,
        'opacity-50 cursor-not-allowed': disabled || loading,
      },
    ]"
    :disabled="disabled || loading"
  >
    <span
      v-if="loading"
      class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
    <slot />
  </button>
</template>
