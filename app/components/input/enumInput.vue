<template>
  <div class="enum-input">
    <select :id="inputId" :value="modelValue" class="select-field" @change="onChange">
      <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
    </select>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  options: {
    type: Array as PropType<string[]>,
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

const onChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<style lang="postcss" scoped>
.select-field {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
}
</style>
