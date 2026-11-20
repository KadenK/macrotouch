<template>
  <Modal v-model="isOpen" :title="modalTitle" :wide="true" :hold-position="true">
    <div class="edit-form">
      <section class="edit-column">
        <div class="form-group">
          <label>Name</label>
          <input v-model="name" type="text" class="text-input" placeholder="Macro name" />
        </div>

        <NodeSelect v-model="selectedNodeId" />
        <div class="form-group">
          <label>Action</label>
          <ActionPicker v-model="selectedActionId" :groups="selectedGroups" />
          <small v-if="selectedWarning" class="action-warning">
            {{ selectedWarning.message }}<template v-if="selectedWarning.hint"> — {{ selectedWarning.hint }}</template>
          </small>
        </div>

        <ActionFields
          v-show="selectedActionFields.length > 0"
          :key="openCount"
          v-model="actionParameters"
          :action-fields="selectedActionFields"
          :node-id="selectedNodeId"
          :action-id="selectedActionId"
        />
      </section>

      <section class="edit-column">
        <!-- The face settings the face depends on, in the order it lists them; see composables/useMacroFace.ts. -->
        <component
          :is="faceSettingComponent(setting)"
          v-for="setting in shownSettings"
          :key="`${editorKey}:${faceSettingId(setting)}`"
          v-model:base="baseSettings"
          v-model:state-appearance="panelStateAppearance"
          v-model:face-settings="faceSettings"
          :macro="editedMacro"
          :state="actionState"
          :setting="typeof setting === 'string' ? undefined : setting"
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
import { ActionType, actionStateKey, createColor, findActionState } from '~/../shared/types'
import { IconSource } from '~/../shared/types/macro'
import { isSelectable, type FaceSetting } from '~/../shared/types/plugin'
import { uuid } from '~/../shared/uuid'
import {
  faceSettingId,
  faceSettingsFor,
  useMacroFace,
  type BaseFaceSettings,
  type StateAppearance,
} from '~/composables/useMacroFace'
import NodeSelect from './NodeSelect.vue'
import IconSetting from './face-settings/IconSetting.vue'
import ColorSetting from './face-settings/ColorSetting.vue'
import StateIconSetting from './face-settings/StateIconSetting.vue'
import TextSetting from './face-settings/TextSetting.vue'
import PluginFaceSetting from './face-settings/PluginFaceSetting.vue'

const GENERIC_ICON = 'ic:baseline-home'
const DEFAULT_ICON_COLOR = createColor(0, 0, 0)
const DEFAULT_BACKGROUND_COLOR = createColor(255, 255, 255)
/** A plain-JSON copy; a reactive store proxy cannot go through structuredClone. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

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

const selectedNodeId = ref('')
const selectedGroups = computed(
  () => store.catalogs[selectedNodeId.value || store.localNode?.nodeId || '']?.groups ?? [],
)
const selectedActions = computed(() => selectedGroups.value.flatMap((group) => group.actions))
const selectedActionId = ref('')
const actionParameters = ref<Record<string, unknown>>({})

const selectedAction = computed(() =>
  selectedActions.value.find((action) => action.actionId === selectedActionId.value),
)
const selectedActionFields = computed(() => selectedAction.value?.actionFields ?? [])
const selectedGroup = computed(() =>
  selectedGroups.value.find((group) => group.actions.some((action) => action.actionId === selectedActionId.value)),
)
const selectedWarning = computed(() =>
  [selectedGroup.value?.availability, selectedAction.value?.availability].find(
    (availability) => availability?.status === 'not-ready' || availability?.status === 'not-configured',
  ),
)

function firstSelectableAction() {
  return (
    selectedGroups.value.flatMap((group) =>
      isSelectable(group.availability) ? group.actions.filter((action) => isSelectable(action.availability)) : [],
    )[0]?.actionId ?? ''
  )
}

/** What the chosen action reports live with the chosen parameters, which picks the appearance editor. */
const actionState = computed(() => findActionState(selectedAction.value?.states, actionParameters.value))
const effectiveKind = computed(() => (selectedAction.value ? actionState.value?.kind : macro.value?.stateKind))
/** The face the action names. An action missing from the catalog (its node is offline) keeps the saved one. */
const selectedFaceId = computed(() =>
  selectedAction.value
    ? selectedAction.value.face
    : selectedActionId.value === macro.value?.actionId
      ? macro.value?.face
      : undefined,
)
const standardSettings = { icon: IconSetting, colors: ColorSetting, stateIcons: StateIconSetting, text: TextSetting }
/** The editor component for a face setting. */
function faceSettingComponent(setting: FaceSetting) {
  return typeof setting === 'string' ? standardSettings[setting] : PluginFaceSetting
}
const face = computed(() => useMacroFace(selectedFaceId.value, effectiveKind.value))
const shownSettings = computed(() => faceSettingsFor(face.value, effectiveKind.value))
const faceSettings = ref<Record<string, unknown> | undefined>()
const editedMacro = computed<Macro>(() => ({
  ...(macro.value ?? { id: '' }),
  name: name.value,
  ...baseSettings.value,
  face: selectedFaceId.value,
  faceSettings: faceSettings.value,
}))

/** A new editor for each opening and each change of state, so it sets itself up from the macro afresh. */
const openCount = ref(0)
const editorKey = computed(() => {
  const state = actionState.value
  const which = state ? `${selectedActionId.value}:${state.kind}:${JSON.stringify(state.when ?? {})}` : 'none'
  return `${openCount.value}:${which}:${face.value.id}`
})

const name = ref('')
const baseSettings = ref<BaseFaceSettings>({
  icon: { source: IconSource.Library, value: GENERIC_ICON },
  iconColor: DEFAULT_ICON_COLOR,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
})
const stateAppearance = ref<StateAppearance | undefined>()
/**
 * The action and parameters `stateAppearance` was made for. A panel for any
 * other choice starts from its own defaults, rather than reading another
 * state's icons (Mute's) as customisations of its own.
 */
const appearanceOwner = ref('')
const currentOwner = computed(() => actionStateKey(selectedActionId.value, actionParameters.value))
const panelStateAppearance = computed({
  get: () => (appearanceOwner.value === currentOwner.value ? stateAppearance.value : undefined),
  set: (value) => {
    stateAppearance.value = value
    appearanceOwner.value = currentOwner.value
  },
})

watch(isOpen, (open) => {
  if (!open) return
  openCount.value++
  faceSettings.value = macro.value?.faceSettings ? clone(macro.value.faceSettings) : undefined
  selectedNodeId.value = macro.value?.nodeId ?? store.localNode?.nodeId ?? ''

  if (macro.value) {
    name.value = macro.value.name
    baseSettings.value = {
      icon: { ...macro.value.icon },
      iconColor: macro.value.iconColor,
      backgroundColor: macro.value.backgroundColor,
    }
    stateAppearance.value = macro.value.stateAppearance ? clone(macro.value.stateAppearance) : undefined
    appearanceOwner.value = actionStateKey(macro.value.actionId ?? '', macro.value.parameters)
    selectedActionId.value = macro.value.actionId ?? ''
    actionParameters.value = macro.value.parameters ? { ...macro.value.parameters } : {}
  } else {
    name.value = 'New Macro'
    const firstAction = firstSelectableAction()
    // New macros start from the action's default icon and the screen's default colors.
    baseSettings.value = {
      icon: {
        source: IconSource.Library,
        value: selectedActions.value.find((action) => action.actionId === firstAction)?.icon ?? GENERIC_ICON,
      },
      iconColor: screen.value?.defaultMacroIconColor ?? DEFAULT_ICON_COLOR,
      backgroundColor: screen.value?.defaultMacroBackgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    }
    stateAppearance.value = undefined
    appearanceOwner.value = ''
    selectedActionId.value = firstAction
    actionParameters.value = {}
  }
})

watch(
  () => selectedActionId.value,
  (newActionId, oldActionId) => {
    // Opening an existing macro must not rewrite its saved parameters.
    if (macro.value && newActionId === macro.value.actionId) return
    // When action changes, reset parameter values for new action fields.
    const selectedAction = selectedActions.value.find((action) => action.actionId === newActionId)
    applyDefaultIcon(
      selectedActions.value.find((action) => action.actionId === oldActionId)?.icon,
      selectedAction?.icon,
    )
    if (selectedAction) {
      const freshParams: Record<string, unknown> = {}
      for (const field of selectedAction.actionFields) {
        const current = actionParameters.value[field.key]
        // A dropdown shows its first option when nothing is chosen, so that is the value it starts with.
        if (field.type === ActionType.Enum && field.options?.length) {
          freshParams[field.key] = field.options.includes(current as string) ? current : field.options[0]
        } else {
          freshParams[field.key] = current ?? ''
        }
      }
      actionParameters.value = freshParams
    } else if (!newActionId) {
      actionParameters.value = {}
    }
    // An action missing from the catalog (not loaded yet, or its node is
    // offline) keeps its parameters so saving does not lose them.
  },
)

/**
 * Switches the macro's icon to the new action's default, unless the user chose
 * their own: only the generic icon or the previous action's default is replaced.
 */
function applyDefaultIcon(previousDefault: string | undefined, nextDefault: string | undefined) {
  const icon = baseSettings.value.icon
  const isDefault =
    icon.source === IconSource.Library && (icon.value === GENERIC_ICON || icon.value === previousDefault)
  if (!isDefault) return
  baseSettings.value = {
    ...baseSettings.value,
    icon: { source: IconSource.Library, value: nextDefault ?? GENERIC_ICON },
  }
}

// The catalog can arrive after a new-macro modal is already open.
watch(
  () => selectedGroups.value,
  () => {
    if (isOpen.value && !macro.value && !selectedActionId.value) {
      selectedActionId.value = firstSelectableAction()
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
    ...baseSettings.value,
    ...(selectedNodeId.value && selectedNodeId.value !== store.localNode?.nodeId
      ? { nodeId: selectedNodeId.value }
      : {}),
    ...(selectedFaceId.value ? { face: selectedFaceId.value } : {}),
  }
  // Only values of face settings the face shows: `text`, or a plugin face setting's id.
  const kept = Object.entries(faceSettings.value ?? {}).filter(([key]) =>
    shownSettings.value.some((setting) => faceSettingId(setting) === key),
  )
  // An action missing from the catalog (its node is offline) keeps its saved face settings.
  const keepSaved = !!selectedActionId.value && selectedActionId.value === macro.value?.actionId
  if (!selectedAction.value && keepSaved && macro.value?.faceSettings) updatedMacro.faceSettings = faceSettings.value
  else if (kept.length) updatedMacro.faceSettings = Object.fromEntries(kept)
  const appearance = selectedAction.value
    ? shownSettings.value.includes('stateIcons')
      ? panelStateAppearance.value
      : undefined
    : keepSaved
      ? macro.value?.stateAppearance
      : undefined
  const stateKind = selectedAction.value ? actionState.value?.kind : keepSaved ? macro.value?.stateKind : undefined
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

<style scoped>
.action-warning {
  color: var(--color-text-subtle);
}
</style>
