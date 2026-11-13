<template>
  <div class="color-field">
    <span class="color-field-label">{{ label }}</span>
    <ColorInput :model-value="modelValue" :label="label" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>

<script lang="ts" setup>
import ColorInput from '~/components/input/colorInput.vue'

defineProps<{
  label: string
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}
</style>
