<template>
  <div class="action-fields">
    <div v-for="field in actionFields" :key="field.key" class="fields-group">
      <label :for="field.key">{{ field.label }}</label>

      <component
        :is="controlComponent[field.type] || controlComponent[ActionType.String]"
        :id="field.key"
        v-model="internalParameters[field.key]"
        :options="field.type === ActionType.Enum ? field.options || [] : undefined"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, watch } from 'vue'
import type { Component, PropType } from 'vue'
import type { ActionField } from '~/../types/action'
import { ActionType } from '~/../types/action'
import StringInput from '~/components/input/stringInput.vue'
import FilepathInput from '~/components/input/filepathInput.vue'
import ExecutablePathInput from '~/components/input/executablePathInput.vue'
import EnumInput from '~/components/input/enumInput.vue'

const controlComponent: Record<ActionType, Component> = {
  [ActionType.String]: StringInput,
  [ActionType.Filepath]: FilepathInput,
  [ActionType.ExecutablePath]: ExecutablePathInput,
  [ActionType.Enum]: EnumInput,
}

const props = defineProps({
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
