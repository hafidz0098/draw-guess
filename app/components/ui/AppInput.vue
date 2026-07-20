<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  label?: string
  placeholder?: string
  type?: string
  error?: string
  maxlength?: number
  disabled?: boolean
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="label">{{ label }}</label>
    <input
      class="input"
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      :class="{ 'border-red-400 focus:border-red-400 focus:ring-red-100': error }"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <p v-if="error" class="mt-1 text-xs font-semibold text-red-500">{{ error }}</p>
  </div>
</template>
