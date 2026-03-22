<template>
  <div class="action-fields-form">
    <div v-for="field in actionFields" :key="field.key" class="form-group">
      <label :for="field.key">{{ field.label }}</label>

      <input
        v-if="
          field.type === ActionType.String ||
          field.type === ActionType.Filepath ||
          field.type === ActionType.ExecutablePath
        "
        :id="field.key"
        v-model="internalParameters[field.key]"
        type="text"
        @input="emitChange"
      />

      <select
        v-else-if="field.type === ActionType.Enum"
        :id="field.key"
        v-model="internalParameters[field.key]"
        @change="emitChange"
      >
        <option v-for="option in field.options || []" :key="option" :value="option">
          {{ option }}
        </option>
      </select>

      <input v-else :id="field.key" v-model="internalParameters[field.key]" type="text" @input="emitChange" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, watch } from 'vue'
import type { PropType } from 'vue'
import type { ActionField } from '~/../types/action'
import { ActionType } from '~/../types/action'

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

const internalParameters = reactive<Record<string, unknown>>({})

const initializeParameters = () => {
  // Keep existing values; add fields if missing.
  for (const field of props.actionFields) {
    if (props.modelValue && Object.prototype.hasOwnProperty.call(props.modelValue, field.key)) {
      internalParameters[field.key] = props.modelValue[field.key]
    } else if (internalParameters[field.key] === undefined) {
      internalParameters[field.key] = ''
    }
  }

  // Remove stale keys no longer in actionFields
  for (const key of Object.keys(internalParameters)) {
    if (!props.actionFields.some((f) => f.key === key)) {
      delete internalParameters[key]
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
      internalParameters[field.key] = newValue[field.key] ?? ''
    }
  },
  { immediate: true, deep: true },
)

const emitChange = () => {
  emit('update:modelValue', { ...internalParameters })
}
</script>

<style scoped>
.action-fields-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
