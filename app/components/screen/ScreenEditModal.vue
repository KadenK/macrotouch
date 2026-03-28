<template>
  <Modal v-model="isOpen" title="Edit Screen" :fixed-size="true">
    <div class="edit-form">
      <div class="form-group">
        <label>Screen Name</label>
        <input v-model="editForm.name" type="text" class="text-input" placeholder="Screen name" />
      </div>

      <div class="form-group">
        <label>Grid Size</label>
        <div class="grid-size-inputs">
          <div class="grid-size-field">
            <label class="sub-label">Rows</label>
            <input v-model.number="editForm.rows" type="number" class="text-input number-input" min="1" max="10" />
          </div>
          <span class="grid-divider">×</span>
          <div class="grid-size-field">
            <label class="sub-label">Columns</label>
            <input v-model.number="editForm.columns" type="number" class="text-input number-input" min="1" max="10" />
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Screen Background Color</label>
        <input v-model="editForm.bgColorHex" type="color" />
      </div>

      <div class="form-group">
        <label>Default Macro Icon Color</label>
        <input v-model="editForm.defaultIconColorHex" type="color" />
      </div>

      <div class="form-group">
        <label>Default Macro Background Color</label>
        <input v-model="editForm.defaultBgColorHex" type="color" />
      </div>

      <div class="modal-actions">
        <div class="right-actions">
          <button class="cancel-btn" @click="closeModal">Cancel</button>
          <button class="save-btn" @click="saveScreen">Save</button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import { colorFromHex, colorToHex } from '~/../types'

const props = defineProps<{
  modelValue: boolean
  screenId: string
}>()

const emit = defineEmits<{
  'update:modelValue': (value: boolean) => void
  saved: void
}>()

const store = useMacroStore()
const screen = computed(() => store.getScreen(props.screenId))

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const editForm = ref({
  name: '',
  rows: 3,
  columns: 5,
  bgColorHex: '',
  defaultIconColorHex: '',
  defaultBgColorHex: '',
})

watch(isOpen, (open) => {
  if (!open || !screen.value) return
  const s = screen.value
  editForm.value = {
    name: s.name ?? '',
    rows: s.size?.rows ?? 3,
    columns: s.size?.columns ?? 5,
    bgColorHex: colorToHex(s.backgroundColor),
    defaultIconColorHex: s.defaultMacroIconColor ? colorToHex(s.defaultMacroIconColor) : '#000000',
    defaultBgColorHex: s.defaultMacroBackgroundColor ? colorToHex(s.defaultMacroBackgroundColor) : '#ffffff',
  }
})

function closeModal() {
  isOpen.value = false
}

function saveScreen() {
  if (!screen.value) return

  const updatedScreen = {
    ...screen.value,
    name: editForm.value.name,
    size: {
      rows: Math.max(1, Math.min(10, editForm.value.rows)),
      columns: Math.max(1, Math.min(10, editForm.value.columns)),
    },
    backgroundColor: colorFromHex(editForm.value.bgColorHex),
    defaultMacroIconColor: colorFromHex(editForm.value.defaultIconColorHex),
    defaultMacroBackgroundColor: colorFromHex(editForm.value.defaultBgColorHex),
  }

  store.updateScreen(updatedScreen)
  emit('saved')
  closeModal()
}
</script>

<style scoped lang="postcss">
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

.form-group > label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
}

.text-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.95rem;
  color: #111827;
  background: white;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.grid-size-inputs {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.grid-size-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sub-label {
  font-size: 0.8rem;
  color: #6b7280;
  font-weight: 500;
}

.number-input {
  width: 5rem;
  text-align: center;
}

.grid-divider {
  font-size: 1.25rem;
  color: #9ca3af;
  padding-bottom: 0.4rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.right-actions {
  display: flex;
  gap: 0.5rem;
}

.cancel-btn,
.save-btn {
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
</style>