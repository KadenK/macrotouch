<template>
  <label class="color-input">
    <span class="color-swatch" :style="{ backgroundColor: modelValue }"></span>
    <!-- The native input stays on top (invisible) so clicking opens the system picker. -->
    <input class="color-native" type="color" :value="modelValue" :aria-label="label" @input="onInput" />
  </label>
</template>

<script lang="ts" setup>
defineProps<{
  modelValue: string
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<style scoped>
.color-input {
  position: relative;
  display: inline-block;
  width: 2.5rem;
  height: 1.825rem;
  box-sizing: border-box;
  /* The 2px "border" is the padding showing this background, so the outer and
     inner corner radii can be set independently (and kept equal). */
  padding: 2px;
  border-radius: 6px;
  background: var(--color-input-border);
  cursor: pointer;
  transition: background-color 0.1s ease;

  &:hover {
    background: var(--color-border-strong);
  }

  &:focus-within {
    background: var(--color-primary);
  }
}

.color-swatch {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 6px;
}

.color-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
