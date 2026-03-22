<!-- components/screen/ScreenEditModal.vue -->
<template>
  <Modal v-model="isOpen" title="Edit Screen" :fixed-size="true">
    <div class="edit-form">
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
  bgColorHex: '',
  defaultIconColorHex: '',
  defaultBgColorHex: '',
})

// Load screen data when modal opens
watch(isOpen, (open) => {
  if (!open || !screen.value) return
  const s = screen.value
  editForm.value = {
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
.form-group label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
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
