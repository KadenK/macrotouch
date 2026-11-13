<template>
  <Modal v-model="isOpen" :title="modalTitle" :wide="true" :hold-position="true">
    <div class="edit-form">
      <section class="edit-column">
        <div class="form-group">
          <label>Name</label>
          <input v-model="name" type="text" class="text-input" placeholder="Macro name" />
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

        <ActionFields
          v-if="selectedActionFields.length > 0"
          v-model="actionParameters"
          :action-fields="selectedActionFields"
        />
      </section>

      <section class="edit-column">
        <!-- The right side depends on what the action reports live; see composables/useMacroKind.ts. -->
        <component
          :is="settingsPanel"
          :key="editorKey"
          v-model:look="look"
          v-model:state-appearance="stateAppearance"
          :state="actionState"
        />
      </section>
    </div>

    <template #footer>
      <div class="form-actions">
        <button v-if="macro" class="delete-btn" @click="deleteMacro">Delete</button>
        <div class="button-group">
          <button class="cancel-btn" @click="closeModal">Cancel</button>
          <button class="save-btn" @click="saveMacro">Save</button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Modal from '~/components/ui/Modal.vue'
import type { Macro, Position } from '~/../shared/types'
import { createColor, findActionState } from '~/../shared/types'
import { IconSource } from '~/../shared/types/macro'
import { uuid } from '~/../shared/uuid'
import { useMacroKind, type MacroLook, type StateAppearance } from '~/composables/useMacroKind'

const props = defineProps<{
  modelValue: boolean
  macroId?: string | null
  screenId: string
  position: Position
  editable?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved' | 'deleted'): void
}>()

const store = useMacroStore()

const macro = computed<Macro | undefined>(() => (props.macroId ? store.getMacro(props.macroId) : undefined))

const screen = computed(() => store.getScreen(props.screenId))

const modalTitle = computed(() => (macro.value ? 'Edit Macro' : 'Create Macro'))

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const selectedActionId = ref('')
const actionParameters = ref<Record<string, unknown>>({})

const selectedAction = computed(() => store.actions.find((action) => action.actionId === selectedActionId.value))
const selectedActionFields = computed(() => selectedAction.value?.actionFields ?? [])

/** What the chosen action reports live with the chosen parameters, which picks the appearance editor. */
const actionState = computed(() => findActionState(selectedAction.value?.states, actionParameters.value))
const settingsPanel = computed(() => useMacroKind(actionState.value?.kind).settings)

/** A new editor for each opening and each change of state, so it sets itself up from the macro afresh. */
const openCount = ref(0)
const editorKey = computed(() => {
  const state = actionState.value
  const which = state ? `${selectedActionId.value}:${state.kind}:${JSON.stringify(state.when ?? {})}` : 'none'
  return `${openCount.value}:${which}`
})

const name = ref('')
const look = ref<MacroLook>({
  icon: { source: IconSource.Library, value: 'ic:baseline-home' },
  iconColor: createColor(0, 0, 0),
  backgroundColor: createColor(255, 255, 255),
})
const stateAppearance = ref<StateAppearance | undefined>()

watch(isOpen, (open) => {
  if (!open) return
  openCount.value++

  if (macro.value) {
    name.value = macro.value.name
    look.value = {
      icon: { ...macro.value.icon },
      iconColor: macro.value.iconColor,
      backgroundColor: macro.value.backgroundColor,
    }
    // Plain JSON, and a reactive store proxy cannot go through structuredClone.
    stateAppearance.value = macro.value.stateAppearance
      ? JSON.parse(JSON.stringify(macro.value.stateAppearance))
      : undefined
    selectedActionId.value = macro.value.actionId ?? ''
    actionParameters.value = macro.value.parameters ? { ...macro.value.parameters } : {}
  } else {
    name.value = 'New Macro'
    // New macros start from the screen's default colors.
    look.value = {
      icon: { source: IconSource.Library, value: 'ic:baseline-home' },
      iconColor: screen.value?.defaultMacroIconColor ?? createColor(0, 0, 0),
      backgroundColor: screen.value?.defaultMacroBackgroundColor ?? createColor(255, 255, 255),
    }
    stateAppearance.value = undefined
    selectedActionId.value = store.actions[0]?.actionId ?? ''
    actionParameters.value = {}
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
    } else if (!newActionId) {
      actionParameters.value = {}
    }
    // An action missing from the catalog (not loaded yet, or its node is
    // offline) keeps its parameters so saving does not lose them.
  },
)

// The catalog can arrive after a new-macro modal is already open.
watch(
  () => store.actions,
  (available) => {
    if (isOpen.value && !macro.value && !selectedActionId.value) {
      selectedActionId.value = available[0]?.actionId ?? ''
    }
  },
)

function closeModal() {
  isOpen.value = false
}

function saveMacro() {
  const updatedMacro: Macro = {
    id: macro.value?.id || uuid(),
    name: name.value,
    actionId: selectedActionId.value || undefined,
    parameters: actionParameters.value,
    ...look.value,
  }
  // An action missing from the catalog (its node is offline) keeps its saved look and widget.
  const appearance = selectedAction.value ? stateAppearance.value : macro.value?.stateAppearance
  const stateKind = selectedAction.value ? actionState.value?.kind : macro.value?.stateKind
  if (appearance) updatedMacro.stateAppearance = appearance
  if (stateKind) updatedMacro.stateKind = stateKind

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
