<template>
  <div class="enum-input">
    <select :id="inputId" :value="modelValue" class="select-field" @change="onChange">
      <option v-if="modelValue && !normalized.some((option) => option.value === modelValue)" :value="modelValue">
        {{ modelValue }}
      </option>
      <option v-for="option in normalized" :key="option.value" :value="option.value">
        {{ option.label || option.value }}
      </option>
    </select>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { ActionOption } from '~/../shared/types/plugin'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  options: {
    type: Array as PropType<Array<string | ActionOption>>,
    default: () => [],
  },
  id: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const inputId = computed(() => props.id)
const normalized = computed(() =>
  props.options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option)),
)

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<style lang="postcss" scoped>
.select-field {
  width: 100%;
  padding: 0.5rem;
  border: var(--border-width) solid var(--color-input-border);
  border-radius: var(--radius-sm);
  background: var(--color-input-bg);
  color: var(--color-text-strong);
}
</style>
