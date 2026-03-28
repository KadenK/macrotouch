<template>
  <div class="string-input">
    <input :id="inputId" type="text" :value="modelValue" class="input-field" @input="onInput" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
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

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<style lang="postcss" scoped>
.input-field {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
}
</style>
