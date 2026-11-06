<template>
  <Modal v-model="isOpen" :title="modalTitle" :wide="true">
    <div class="edit-form">
      <section class="edit-column">
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
      </section>
    </div>

    <template #footer>
      <div class="form-actions">
        <button v-if="!pendingScreen" class="delete-btn" @click="deleteScreen">Delete</button>
        <div class="button-group">
          <button class="cancel-btn" @click="closeModal">Cancel</button>
          <button class="save-btn" @click="saveScreen">Save</button>
        </div>
      </div>
    </template>
  </Modal>

  <Modal v-model="confirmOpen" title="Apply new default colors?">
    <div class="confirm-body">
      <p>The default macro colors changed. Which existing macros on this screen should use the new colors?</p>
    </div>
    <template #footer>
      <div class="confirm-actions">
        <button class="cancel-btn" @click="confirmOpen = false">Back</button>
        <button class="cancel-btn" @click="finishSave('none')">None</button>
        <button class="save-btn" @click="finishSave('defaults')">Only default-colored</button>
        <button class="save-btn" @click="finishSave('all')">All macros</button>
      </div>
    </template>
  </Modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import type { MacroScreen } from '~/../shared/types'
import { colorFromHex, colorToHex } from '~/../shared/types'
import type { Color } from '~/../shared/types'

type ApplyMode = 'all' | 'defaults' | 'none'

const props = defineProps<{
  modelValue: boolean
  screenId: string
  pendingScreen?: MacroScreen | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [id: string]
  deleted: []
  cancel: []
}>()

const modalTitle = computed(() => (props.pendingScreen ? 'Create Screen' : 'Edit Screen'))
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

const confirmOpen = ref(false)

const FALLBACK_ICON: Color = { r: 0, g: 0, b: 0 }
const FALLBACK_BG: Color = { r: 255, g: 255, b: 255 }

function sameColor(a?: Color, b?: Color) {
  return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b
}

function colorsChanged() {
  const s = screen.value
  if (!s) return false
  const oldIcon = colorToHex(s.defaultMacroIconColor ?? FALLBACK_ICON)
  const oldBg = colorToHex(s.defaultMacroBackgroundColor ?? FALLBACK_BG)
  return oldIcon !== editForm.value.defaultIconColorHex || oldBg !== editForm.value.defaultBgColorHex
}

function saveScreen() {
  if (!screen.value) return
  const hasMacros = screen.value.macroRows.some((r) => r.macrosIds.some((id) => id && store.getMacro(id)))
  if (!props.pendingScreen && hasMacros && colorsChanged()) {
    confirmOpen.value = true
    return
  }
  finishSave('none')
}

function applyToMacros(mode: ApplyMode) {
  const s = screen.value
  if (!s || mode === 'none') return
  const oldIcon = s.defaultMacroIconColor ?? FALLBACK_ICON
  const oldBg = s.defaultMacroBackgroundColor ?? FALLBACK_BG
  const newIcon = colorFromHex(editForm.value.defaultIconColorHex)
  const newBg = colorFromHex(editForm.value.defaultBgColorHex)
  for (const row of s.macroRows) {
    for (const id of row.macrosIds) {
      const macro = id ? store.getMacro(id) : undefined
      if (!macro) continue
      const updated = { ...macro }
      if (mode === 'all' || sameColor(macro.iconColor, oldIcon)) updated.iconColor = newIcon
      if (mode === 'all' || sameColor(macro.backgroundColor, oldBg)) updated.backgroundColor = newBg
      store.updateMacro(updated, id)
    }
  }
}

function finishSave(mode: ApplyMode) {
  confirmOpen.value = false
  if (!screen.value) return

  const isNew = !!props.pendingScreen
  applyToMacros(mode)

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

  if (isNew) {
    store.addScreen(screenData)
  } else {
    store.updateScreen(screenData)
  }

  emit('saved', screenData.id)
  isOpen.value = false
}

function deleteScreen() {
  if (!screen.value) return
  if (confirm(`Are you sure you want to delete the screen "${screen.value.name}"?`)) {
    store.deleteScreen(props.screenId)
    emit('deleted')
    isOpen.value = false
  }
}
</script>

<style scoped lang="postcss">
.confirm-body {
  padding: 1.5rem;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
