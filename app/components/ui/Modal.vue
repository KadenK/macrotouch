<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div :class="['modal-container', { 'modal-container--fixed': fixedSize }]">
        <div class="modal-header">
          <h2 class="modal-title">{{ title }}</h2>
          <div class="modal-actions">
            <button v-if="showBack" aria-label="Go back" class="modal-button modal-back-btn" @click="close">←</button>
            <button v-if="showClose" aria-label="Close modal" class="modal-button modal-close-btn" @click="close">
              ×
            </button>
          </div>
        </div>
        <div class="modal-search">
          <slot name="search"></slot>
        </div>
        <div class="modal-body">
          <slot></slot>
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
}

const props = withDefaults(defineProps<Props>(), {
  showClose: true,
  showBack: false,
  fixedSize: false,
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-container--fixed {
  width: 600px;
  height: 80vh;
  max-width: none;
  max-height: none;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
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
  color: #6b7280;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;

  &:hover {
    color: #111827;
  }
}

.modal-search {
  flex-shrink: 0;
  border-bottom: 1px solid #e5e7eb;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
