<template>
  <div class="filepath-input">
    <div class="input-wrapper">
      <input
        :id="inputId"
        type="text"
        :value="modelValue"
        class="input-field"
        placeholder="Enter file path"
        @input="onInput"
      />
      <button type="button" class="browse-button" @click="openFilePicker">Browse</button>
    </div>

    <input
      ref="filePickerInput"
      type="file"
      :accept="accept"
      class="file-picker-hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="onFileSelected"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: '',
  },
  accept: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const inputId = computed(() => props.id)
const filePickerInput = ref<HTMLInputElement | null>(null)

const updateValue = (value: string) => {
  emit('update:modelValue', value)
}

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  updateValue(target.value)
}

const onFileSelected = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  const filePath = (file as any).path || file.webkitRelativePath || file.name
  updateValue(filePath)

  // Reset so the same file can be picked again if needed
  target.value = ''
}

const openFilePicker = async () => {
  if (window && 'showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
      })
      if (handle) {
        const pickedName = handle.name
        updateValue(pickedName)
        return
      }
    } catch (error) {
      // user cancelled or unsupported; fallback to standard file input
    }
  }

  filePickerInput.value?.click()
}
</script>

<style lang="postcss" scoped>
.filepath-input {
  width: 100%;
}

.input-wrapper {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}

.input-field {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
}

.browse-button {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
  background: var(--v-btn-background, #f7f7f7);
  cursor: pointer;
}

.browse-button:hover {
  background: var(--v-btn-background-hover, #ececec);
}

.file-picker-hidden {
  display: none;
}
</style>
