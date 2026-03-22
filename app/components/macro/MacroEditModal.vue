<template>
  <Modal v-model="isOpen" :title="modalTitle" :fixed-size="true">
    <div class="edit-form">
      <div class="form-group">
        <label>Name</label>
        <input v-model="editForm.name" type="text" placeholder="Macro name" />
      </div>

      <div class="form-group">
        <label>Action</label>
        <select v-model="selectedActionId">
          <option value="">(None)</option>
          <option v-for="action in store.actions" :key="action.actionId" :value="action.actionId">
            {{ action.label }}
          </option>
        </select>
      </div>

      <ActionFieldsForm
        v-if="selectedActionFields.length > 0"
        v-model="actionParameters"
        :action-fields="selectedActionFields"
      />

      <div class="form-group">
        <label>Icon</label>
        <div class="icon-preview" @click="openIconPicker">
          <Icon
            v-if="editForm.icon.source === 'LIBRARY'"
            :name="`ic:${editForm.icon.value}`"
            class="preview-icon"
            :style="{ color: colorToHex(editForm.iconColor) }"
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

  <IconPickerModal v-model="isIconPickerOpen" @select="handleIconSelect" />
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import IconPickerModal from '~/components/iconPicker/IconPickerModal.vue'
import ActionFieldsForm from '~/components/macro/ActionFieldsForm.vue'
import type { Macro, Position, Icon } from '~/../types'
import { createColor, colorFromHex, colorToHex } from '~/../types'
import { IconSource } from '~/../types/macro'

const props = defineProps<{
  modelValue: boolean
  macroId?: string | null
  screenId: string
  position: Position
  editable?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved'): void
  (event: 'deleted'): void
}>()

const store = useMacroStore()

const macro = computed<Macro | undefined>(() => (props.macroId ? store.getMacro(props.macroId) : undefined))

const screen = computed(() => store.getScreen(props.screenId))

const modalTitle = computed(() => (macro.value ? 'Edit Macro' : 'Create Macro'))

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const isIconPickerOpen = ref(false)

const selectedActionId = ref('')
const actionParameters = ref<Record<string, unknown>>({})

const selectedActionFields = computed(() => {
  const selectedAction = store.actions.find((action) => action.actionId === selectedActionId.value)
  return selectedAction?.actionFields ?? []
})

const editForm = ref({
  name: '',
  icon: { source: IconSource.Library, value: 'baseline-home' } as Icon,
  iconColor: createColor(0, 0, 0),
  backgroundColor: createColor(255, 255, 255),
  iconColorHex: '#000000',
  bgColorHex: '#ffffff',
})

watch(isOpen, (open) => {
  if (!open) return

  if (macro.value) {
    // editing existing macro: load its values
    editForm.value = {
      name: macro.value.name,
      icon: { ...macro.value.icon },
      iconColor: macro.value.iconColor,
      backgroundColor: macro.value.backgroundColor,
      iconColorHex: colorToHex(macro.value.iconColor),
      bgColorHex: colorToHex(macro.value.backgroundColor),
    }
    selectedActionId.value = macro.value.actionId ?? ''
    actionParameters.value = macro.value.parameters ? { ...macro.value.parameters } : {}
  } else {
    selectedActionId.value = store.actions[0]?.actionId ?? ''
    actionParameters.value = {}
    // new macro: use screen defaults if available
    const defaultIconColor = screen.value?.defaultMacroIconColor ?? createColor(0, 0, 0)
    const defaultBgColor = screen.value?.defaultMacroBackgroundColor ?? createColor(255, 255, 255)
    editForm.value = {
      name: 'New Macro',
      icon: { source: 'LIBRARY', value: 'baseline-home' } as Icon,
      iconColor: defaultIconColor,
      backgroundColor: defaultBgColor,
      iconColorHex: colorToHex(defaultIconColor),
      bgColorHex: colorToHex(defaultBgColor),
    }
  }
})

watch(
  () => selectedActionId.value,
  (newActionId) => {
    // When action changes, reset parameter values for new action fields.
    const selectedAction = store.actions.find((action) => action.actionId === newActionId)
    if (selectedAction) {
      const freshParams: Record<string, unknown> = {}
      for (const field of selectedAction.actionFields) {
        freshParams[field.key] = actionParameters.value[field.key] ?? ''
      }
      actionParameters.value = freshParams
    } else {
      actionParameters.value = {}
    }
  },
)

watch(
  () => editForm.value.iconColorHex,
  (newHex) => {
    editForm.value.iconColor = colorFromHex(newHex)
  },
)

watch(
  () => editForm.value.bgColorHex,
  (newHex) => {
    editForm.value.backgroundColor = colorFromHex(newHex)
  },
)

function closeModal() {
  isOpen.value = false
}

function openIconPicker() {
  isIconPickerOpen.value = true
}

function handleIconSelect(iconName: string) {
  editForm.value.icon = { source: 'LIBRARY', value: iconName }
  isIconPickerOpen.value = false
}

function saveMacro() {
  const macroId = macro.value?.id || crypto.randomUUID()
  const updatedMacro: Macro = {
    id: macroId,
    name: editForm.value.name,
    actionId: selectedActionId.value || undefined,
    parameters: actionParameters.value,
    icon: editForm.value.icon,
    iconColor: editForm.value.iconColor,
    backgroundColor: editForm.value.backgroundColor,
  }

  if (macro.value) {
    store.updateMacro(updatedMacro)
  } else {
    store.addMacro(props.screenId, updatedMacro, props.position)
  }

  emit('saved')
  closeModal()
}

function deleteMacro() {
  if (!macro.value) return
  if (confirm(`Are you sure you want to delete macro "${macro.value.name}"?`)) {
    store.deleteMacro(props.screenId, props.position)
    emit('deleted')
    closeModal()
  }
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
