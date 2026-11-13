<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @pointerdown.self="close">
      <div
        :class="[
          'modal-container',
          {
            'modal-container--fixed': fixedSize,
            'modal-container--wide': wide,
          },
        ]"
      >
        <div class="modal-header">
          <h2 class="modal-title">{{ title }}</h2>
          <div class="modal-actions">
            <button v-if="showBack" aria-label="Go back" class="modal-button modal-back-btn" @click="close">←</button>
            <button v-if="showClose" aria-label="Close modal" class="modal-button modal-close-btn" @click="close">
              ×
            </button>
          </div>
        </div>
        <div v-if="$slots.search" class="modal-search">
          <slot name="search"></slot>
        </div>
        <div class="modal-body">
          <slot></slot>
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: boolean
  title: string
  showClose?: boolean
  showBack?: boolean
  fixedSize?: boolean
  wide?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showClose: true,
  showBack: false,
  fixedSize: false,
  wide: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const close = () => {
  isOpen.value = false
}
</script>

<style scoped lang="postcss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  box-shadow: var(--shadow-sm);
}

.modal-container--fixed {
  width: 600px;
  height: 80vh;
  max-width: none;
  max-height: none;
}

.modal-container--wide {
  max-width: 880px;
  max-height: calc(100vh - 2rem);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-strong);
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.modal-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text-subtle);
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;

  &:hover {
    color: var(--color-text-strong);
  }
}

.modal-search {
  flex-shrink: 0;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.modal-footer {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
}
</style>
