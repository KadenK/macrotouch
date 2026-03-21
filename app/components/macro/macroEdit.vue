<template>
  <div class="macro-container">
    <button class="macro" :disabled="!editable" @click="openEditor">
      <div v-if="macro" class="macro-display" :style="{ backgroundColor: colorToHex(macro.backgroundColor) }">
        <Icon
          :name="macro.icon.source === 'LIBRARY' ? `ic:${macro.icon.value}` : ''"
          class="macro-icon"
          :style="{ color: colorToHex(macro.iconColor) }"
        />
      </div>
      <div v-else class="macro-display placeholder">
        <span class="placeholder-icon">+</span>
      </div>
    </button>
    <span class="macro-label">{{ macro?.name || 'Empty' }}</span>

    <MacroEditModal
      v-model="isModalOpen"
      :macro-id="props.macroId"
      :screen-id="props.screenId"
      :position="props.position"
      :editable="props.editable"
      @saved="emit('update')"
      @deleted="emit('update')"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import MacroEditModal from './MacroEditModal.vue'
import type { Macro } from '~/../types/macro'
import type { Position } from '~/../types'
import { colorToHex } from '~/../types/common'

const props = defineProps<{
  macroId?: string
  screenId: string
  position: Position
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update'): void
}>()

const store = useMacroStore()

const macro = computed<Macro | undefined>(() => (props.macroId ? store.getMacro(props.macroId) : undefined))

const isModalOpen = ref(false)

function openEditor() {
  if (!props.editable) return
  isModalOpen.value = true
}
</script>

<style scoped lang="postcss">
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
}

.macro {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: #cfcfcf;
  cursor: pointer;
  transition: all 0.2s ease;

  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.macro:hover {
  box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.1);
  transform: scale(0.98);
}

.macro-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.placeholder {
  background-color: #cfcfcf;
}

.placeholder-icon {
  font-size: 3rem;
  font-weight: 700;
  color: #3b82f6;
}

.macro-icon {
  width: 80px;
  height: 80px;
  font-size: 28px;
}

.macro-label {
  font-size: 0.75rem;
  color: var(--label-color, #333);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Modal form styles */
.edit-form {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
}

.form-group input[type='text'] {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.icon-preview {
  width: 64px;
  height: 64px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preview-icon {
  width: 48px;
  height: 48px;
  font-size: 48px;
}

.preview-placeholder {
  font-size: 24px;
  color: #9ca3af;
}

.small-btn {
  padding: 0.25rem 0.5rem;
  background-color: #e5e7eb;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}

.right-actions {
  display: flex;
  gap: 0.5rem;
}

.cancel-btn,
.save-btn,
.delete-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.cancel-btn {
  background-color: #e5e7eb;
}

.save-btn {
  background-color: #3b82f6;
  color: white;
}

.delete-btn {
  background-color: #ef4444;
  color: white;
}

.delete-btn:hover {
  background-color: #dc2626;
}
</style>
