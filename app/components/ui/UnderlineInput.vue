<template>
  <input ref="input" class="underline-input" :type="type" :value="modelValue" @input="onInput" />
</template>

<script lang="ts" setup>
import { ref } from 'vue'

// Borderless input with a 2px underline. The underline is a box-shadow, so it never changes the input's size.
// Size, font and alignment come from the parent's class; attributes and listeners fall through to the <input>.
const props = withDefaults(
  defineProps<{
    modelValue: string | number
    type?: 'text' | 'number'
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const input = ref<HTMLInputElement | null>(null)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  // Number inputs emit a number (NaN while empty); the owner decides how to treat that.
  emit('update:modelValue', props.type === 'number' ? target.valueAsNumber : target.value)
}

defineExpose({
  focus: () => input.value?.focus(),
  select: () => input.value?.select(),
})
</script>

<style scoped>
.underline-input {
  box-sizing: border-box;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: 0 2px 0 0 var(--color-border-strong);
  color: var(--color-ink);
  font-family: inherit;
  /* Inputs ignore line-heights below "normal". */
  line-height: normal;
  outline: none;
  transition: box-shadow 0.1s ease;

  &[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }

  &:hover {
    box-shadow: 0 2px 0 0 var(--color-ink-2);
  }

  &:focus {
    box-shadow: 0 2px 0 0 var(--color-primary);
  }
}
</style>
