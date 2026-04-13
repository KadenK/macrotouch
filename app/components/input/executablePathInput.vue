<template>
  <div class="executable-path-input">
    <div class="input-wrapper">
      <input
        :id="inputId"
        type="text"
        :value="modelValue"
        class="input-field"
        placeholder="Enter app name or executable path"
        @input="onInput"
      />
      <button type="button" class="browse-button" @click="openExecutablePicker">Browse</button>
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
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const inputId = computed(() => props.id)
const filePickerInput = ref<HTMLInputElement | null>(null)

const commonExecutableExtensions = ['.exe', '.bat', '.cmd', '.com', '.sh', '.app', '.desktop']

const accept = computed(() => {
  const platform = typeof navigator !== 'undefined' ? navigator.platform.toLowerCase() : ''
  if (platform.includes('mac')) {
    return '.app,.sh,.desktop,.command'
  }
  if (platform.includes('win')) {
    return '.exe,.bat,.cmd,.com'
  }
  // linux and other platforms
  return '.sh,.desktop,.exe'
})

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

const openExecutablePicker = async () => {
  // Prefer electron IPC native dialog if available
  const electronAPI = (window as any).electronAPI
  if (electronAPI && typeof electronAPI.selectExecutable === 'function') {
    try {
      const selected = await electronAPI.selectExecutable()
      if (selected) {
        updateValue(selected)
        return
      }
    } catch (err) {
      console.warn('ExecutablePathInput: electron selectExecutable failed', err)
    }
  }

  // Web fallback: File System Access API with executable filter
  if (window && 'showOpenFilePicker' in window) {
    try {
      const inputAccept = commonExecutableExtensions
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Executable or application',
            accept: {
              'application/octet-stream': inputAccept,
            },
          },
        ],
        excludeAcceptAllOption: false,
      })
      if (handle) {
        let filePath = handle.name
        if (typeof handle.getFile === 'function') {
          const file = await handle.getFile()
          filePath = (file as any).path || file.name || filePath
        }
        updateValue(filePath)
        return
      }
    } catch (err) {
      // user cancelled or unsupported path, continue to fallback
    }
  }

  filePickerInput.value?.click()
}
</script>

<style lang="postcss" scoped>
.executable-path-input {
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
