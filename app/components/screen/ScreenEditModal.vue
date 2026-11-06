<template>
  <Modal v-model="isOpen" :title="modalTitle" :wide="!!pendingScreen">
    <div class="edit-form" :class="{ 'edit-form--single': !pendingScreen }">
      <!-- Name and grid size are edited inline on the page for existing screens. -->
      <section v-if="pendingScreen" class="edit-column">
        <div class="form-group">
          <label>Screen Name</label>
          <input v-model="editForm.name" type="text" class="text-input" placeholder="Screen name" />
        </div>

        <div class="form-group">
          <label>Grid Size</label>
          <div class="grid-size-inputs">
            <div class="grid-size-field">
              <label class="sub-label">Rows</label>
              <input v-model.number="editForm.rows" type="number" class="text-input number-input" min="1" max="20" />
            </div>
            <span class="grid-divider">×</span>
            <div class="grid-size-field">
              <label class="sub-label">Columns</label>
              <input v-model.number="editForm.columns" type="number" class="text-input number-input" min="1" max="20" />
            </div>
          </div>
        </div>
      </section>

      <section class="edit-column">
        <div class="form-group">
          <label>Screen Background Color</label>
          <ColorInput v-model="editForm.bgColorHex" />
        </div>

        <div class="form-group">
          <label>Default Macro Icon Color</label>
          <ColorInput v-model="editForm.defaultIconColorHex" />
        </div>

        <div class="form-group">
          <label>Default Macro Background Color</label>
          <ColorInput v-model="editForm.defaultBgColorHex" />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="form-actions form-actions--end">
        <div class="button-group">
          <button class="cancel-btn" @click="closeModal">Cancel</button>
          <button class="save-btn" @click="saveScreen">Save</button>
        </div>
      </div>
    </template>
  </Modal>

</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import ColorInput from '~/components/input/colorInput.vue'
import type { MacroScreen } from '~/../shared/types'
import { colorFromHex, colorToHex } from '~/../shared/types'

const props = defineProps<{
  modelValue: boolean
  screenId: string
  pendingScreen?: MacroScreen | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [id: string]
  cancel: []
}>()

const modalTitle = computed(() => (props.pendingScreen ? 'Create Screen' : 'Screen Colors'))
const store = useMacroStore()
const screen = computed(() => props.pendingScreen ?? store.getScreen(props.screenId))

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
  emit('cancel')
  isOpen.value = false
}

function saveScreen() {
  if (!screen.value) return

  const screenData = {
    ...screen.value,
    name: editForm.value.name,
    size: {
      rows: Math.max(1, Math.min(20, editForm.value.rows)),
      columns: Math.max(1, Math.min(20, editForm.value.columns)),
    },
    backgroundColor: colorFromHex(editForm.value.bgColorHex),
    defaultMacroIconColor: colorFromHex(editForm.value.defaultIconColorHex),
    defaultMacroBackgroundColor: colorFromHex(editForm.value.defaultBgColorHex),
  }

  if (props.pendingScreen) {
    store.addScreen(screenData)
  } else {
    store.updateScreen(screenData)
  }

  emit('saved', screenData.id)
  isOpen.value = false
}

</script>

<style scoped lang="postcss">
.edit-form--single {
  grid-template-columns: minmax(0, 1fr);
}

.form-actions--end {
  justify-content: flex-end;
}

</style>
