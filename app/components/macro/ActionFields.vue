<template>
  <div class="action-fields">
    <div v-for="field in actionFields" :key="field.key" class="fields-group">
      <label :for="field.key">{{ field.label }}</label>

      <component
        :is="controlComponent[field.type] || controlComponent[ActionType.String]"
        :id="field.key"
        v-model="internalParameters[field.key]"
        :options="optionsFor(field)"
      />
      <template v-if="field.dynamicOptions">
        <button type="button" @click="loadOptions(field.key, true)">Refresh</button>
        <small v-if="optionState[field.key]?.loading">Loading options…</small>
        <small v-else-if="optionState[field.key]?.error">{{ optionState[field.key]?.error }}</small>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, watch } from 'vue'
import type { Component, PropType } from 'vue'
import { useMacroStore } from '~/stores/macro'
import type { ActionOption } from '~/../shared/types/plugin'
import { errorText } from '~/../shared/errors'
import type { ActionField } from '~/../shared/types/action'
import { ActionType } from '~/../shared/types/action'
import StringInput from '~/components/input/stringInput.vue'
import FilepathInput from '~/components/input/filepathInput.vue'
import ExecutablePathInput from '~/components/input/executablePathInput.vue'
import EnumInput from '~/components/input/enumInput.vue'
import KeyComboInput from '~/components/input/keyComboInput.vue'

const controlComponent: Record<ActionType, Component> = {
  [ActionType.String]: StringInput,
  [ActionType.Filepath]: FilepathInput,
  [ActionType.ExecutablePath]: ExecutablePathInput,
  [ActionType.Enum]: EnumInput,
  [ActionType.KeyCombo]: KeyComboInput,
}

const props = defineProps({
  nodeId: { type: String, default: '' },
  actionId: { type: String, default: '' },
  actionFields: {
    type: Array as PropType<ActionField[]>,
    default: () => [],
  },
  modelValue: {
    type: Object as PropType<Record<string, unknown>>,
    default: () => ({}),
  },
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, unknown>): void
}>()

const internalParameters = reactive<Record<string, string>>({})
const store = useMacroStore()
const optionState = reactive<Record<string, { options: ActionOption[]; loading: boolean; error: string }>>({})
const cache = new Map<string, ActionOption[]>()
let generation = 0
/** A dropdown's choices: those loaded from the action for dynamic options, else the field's own. */
function optionsFor(field: ActionField) {
  if (field.type !== ActionType.Enum) return undefined
  return (field.dynamicOptions && optionState[field.key]?.options) || field.options || []
}
/** A dropdown shows its first option when nothing is chosen, so that is the value it starts with (as for static options). */
function defaultToFirst(field: string, options: ActionOption[]) {
  if (!internalParameters[field] && options[0]) internalParameters[field] = options[0].value
}
async function loadOptions(field: string, refresh = false) {
  const key = JSON.stringify([props.nodeId, props.actionId, field])
  const currentGeneration = generation
  const cached = cache.get(key)
  if (cached && !refresh) {
    optionState[field] = { options: cached, loading: false, error: '' }
    defaultToFirst(field, cached)
    return
  }
  optionState[field] = { options: cached ?? [], loading: true, error: '' }
  try {
    const options = await store.listOptions(props.nodeId || undefined, props.actionId, field, { ...props.modelValue })
    cache.set(key, options)
    if (currentGeneration === generation) {
      optionState[field] = { options, loading: false, error: '' }
      defaultToFirst(field, options)
    }
  } catch (error) {
    if (currentGeneration === generation)
      optionState[field] = {
        options: cached ?? [],
        loading: false,
        error: errorText(error),
      }
  }
}
watch(
  () => [props.nodeId, props.actionId, props.actionFields] as const,
  () => {
    generation++
    for (const field of props.actionFields) if (field.dynamicOptions && props.actionId) void loadOptions(field.key)
  },
  { immediate: true },
)

const initializeParameters = () => {
  // Keep existing values; add fields if missing.
  for (const field of props.actionFields) {
    if (props.modelValue && Object.prototype.hasOwnProperty.call(props.modelValue, field.key)) {
      internalParameters[field.key] = String(props.modelValue[field.key] ?? '')
    } else if (internalParameters[field.key] === undefined) {
      internalParameters[field.key] = ''
    }
  }

  // Reset stale keys no longer in actionFields
  for (const key of Object.keys(internalParameters)) {
    if (!props.actionFields.some((f) => f.key === key)) {
      internalParameters[key] = ''
    }
  }
}

initializeParameters()

watch(
  () => props.actionFields,
  () => {
    if (!props.actionFields.length) return
    initializeParameters()
    emit('update:modelValue', { ...internalParameters })
  },
  { immediate: true, deep: true },
)

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) return
    for (const field of props.actionFields) {
      internalParameters[field.key] = String(newValue[field.key] ?? '')
    }
  },
  { immediate: true, deep: true },
)

watch(
  internalParameters,
  (next) => {
    emit('update:modelValue', { ...next })
  },
  { deep: true },
)
</script>

<style scoped>
.action-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
