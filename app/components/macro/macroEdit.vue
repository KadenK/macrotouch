<template>
  <div class="macro-container">
    <button class="macro" @click="openEditor">
      <div v-if="macro" class="macro-display" :style="{ backgroundColor: macro.backgroundColor.toHex() }">
        <Icon
          :name="macro.icon.source === 'LIBRARY' ? `ic:${macro.icon.value}` : ''"
          class="macro-icon"
          :style="{ color: macro.iconColor.toHex() }"
        />
      </div>
      <div v-else class="macro-display placeholder">
        <span class="placeholder-icon">+</span>
      </div>
    </button>
    <span class="macro-label">{{ macro?.name || 'Empty' }}</span>

    <!-- Edit Modal -->
    <Modal v-model="isModalOpen" title="Edit Macro" :fixed-size="true">
      <div class="edit-form">
        <div class="form-group">
          <label>Name</label>
          <input v-model="editForm.name" type="text" placeholder="Macro name" />
        </div>

        <div class="form-group">
          <label>Icon</label>
          <div class="icon-preview" @click="openIconPicker">
            <Icon
              v-if="editForm.icon.source === 'LIBRARY'"
              :name="`ic:${editForm.icon.value}`"
              class="preview-icon"
              :style="{ color: editForm.iconColor.toHex() }"
            />
            <span v-else class="preview-placeholder">?</span>
          </div>
          <button class="small-btn" @click="openIconPicker">Choose Icon</button>
        </div>

        <div class="form-group">
          <label>Icon Color</label>
          <input v-model="editForm.iconColorHex" type="color" />
        </div>

        <div class="form-group">
          <label>Background Color</label>
          <input v-model="editForm.bgColorHex" type="color" />
        </div>

        <div class="modal-actions">
          <button v-if="macro" class="delete-btn" @click="deleteMacro">Delete</button>
          <div class="right-actions">
            <button class="cancel-btn" @click="closeModal">Cancel</button>
            <button class="save-btn" @click="saveMacro">Save</button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Icon Picker Modal (reuse existing) -->
    <IconPickerModal v-model="isIconPickerOpen" @select="handleIconSelect" />
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import IconPickerModal from '~/components/iconPicker/IconPickerModal.vue'
import type { MacroData, Position } from '~/../types'
import { createMacro, createNoOpActionData, IconSource } from '~/../types/macro'
import { Color } from '~/../types/common'

const props = defineProps<{
  macroId?: string // if undefined, this is an empty slot
  screenId: string
  position: Position
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update'): void
}>()

const store = useMacroStore()
store.init()
const { macros } = storeToRefs(store)

// The macro data for this cell (could be undefined)
const macro = computed(() => (props.macroId ? macros.value[props.macroId] : undefined))

// Modal states
const isModalOpen = ref(false)
const isIconPickerOpen = ref(false)

// Form state for editing
const editForm = ref({
  name: '',
  icon: { source: IconSource.Library, value: 'baseline:home' },
  iconColor: new Color(0, 0, 0),
  backgroundColor: new Color(255, 255, 255),
  iconColorHex: '#000000',
  bgColorHex: '#ffffff',
})

// Initialize form when modal opens
watch(isModalOpen, (open) => {
  if (open) {
    if (macro.value) {
      // Editing existing macro
      editForm.value = {
        name: macro.value.name,
        icon: { ...macro.value.icon },
        iconColor: macro.value.iconColor,
        backgroundColor: macro.value.backgroundColor,
        iconColorHex: macro.value.iconColor.toHex(),
        bgColorHex: macro.value.backgroundColor.toHex(),
      }
    } else {
      // Creating new macro
      const newMacro = createMacro()
      editForm.value = {
        name: newMacro.name,
        icon: newMacro.icon,
        iconColor: newMacro.iconColor,
        backgroundColor: newMacro.backgroundColor,
        iconColorHex: newMacro.iconColor.toHex(),
        bgColorHex: newMacro.backgroundColor.toHex(),
      }
    }
  }
})

// Update color objects when hex strings change
watch(
  () => editForm.value.iconColorHex,
  (newHex) => {
    editForm.value.iconColor = Color.fromHex(newHex)
  },
)
watch(
  () => editForm.value.bgColorHex,
  (newHex) => {
    editForm.value.backgroundColor = Color.fromHex(newHex)
  },
)

function openEditor() {
  if (!props.editable) return
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
}

function openIconPicker() {
  isIconPickerOpen.value = true
}

function handleIconSelect(iconName: string) {
  editForm.value.icon = { source: IconSource.Library, value: iconName }
  isIconPickerOpen.value = false
}

function saveMacro() {
  const macroData: MacroData = {
    id: macro.value?.id || crypto.randomUUID(),
    name: editForm.value.name,
    // If editing existing macro, use its action; otherwise use default no-op action
    action: macro.value ? macro.value.action : createNoOpActionData(),
    icon: editForm.value.icon,
    iconColor: editForm.value.iconColor,
    backgroundColor: editForm.value.backgroundColor,
  }

  store.setMacroAt(props.screenId, props.position, macroData)
  closeModal()
  emit('update')
}

function deleteMacro() {
  if (!macro.value) return
  if (confirm(`Are you sure you want to delete macro "${macro.value.name}"?`)) {
    store.clearMacroAt(macro.value.id, props.screenId, props.position)
    closeModal()
    emit('update')
  }
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
  color: #333;
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
