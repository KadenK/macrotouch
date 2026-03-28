<template>
  <div class="keycombo-input">
    <input
      :id="inputId"
      type="text"
      :value="displayValue"
      class="input-field"
      placeholder="Press keys to set combo"
      @input="onTextInput"
      @keydown="onKeyDown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div class="input-actions">
      <button type="button" class="record-button" @click="toggleRecording">
        {{ isRecording ? 'Stop recording' : 'Record combo' }}
      </button>
      <button v-if="displayValue" type="button" class="clear-button" @click="clearCombo">Clear</button>
    </div>
    <p class="hint">Type a combo directly, or click Record and press keys (e.g. Ctrl+Shift+P).</p>
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

const isFocused = ref(false)
const isRecording = ref(false)

const inputId = computed(() => props.id)

const comboAlias: Record<string, string> = {
  Escape: 'esc',
  ' ': 'space',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Home: 'home',
  End: 'end',
  Insert: 'insert',
  Pause: 'pause',
  PrintScreen: 'printscreen',
  ScrollLock: 'scrolllock',
  CapsLock: 'capslock',
  NumLock: 'numlock',
}

const normalizeKeyFromEvent = (event: KeyboardEvent) => {
  const { code, key } = event

  // Standard physical key codes for letters/numbers
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return code.toLowerCase()

  // function keys and other non-printables can use code and alias map
  if (code.startsWith('F') && !Number.isNaN(Number(code.slice(1)))) {
    return code.toLowerCase()
  }

  if (comboAlias[key] || comboAlias[code]) {
    return comboAlias[key] || comboAlias[code]
  }

  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase() || code.toLowerCase()
}

const modifierToken = (code: string): string | undefined => {
  if (code.startsWith('Control')) return 'ctrl'
  if (code.startsWith('Shift')) return 'shift'
  if (code.startsWith('Alt')) return 'alt'
  if (code.startsWith('Meta')) return 'meta'
  return undefined
}

const displayValue = computed(() => props.modelValue)

const activeModifiers = ref(new Set<string>())

const updateValue = (value: string) => {
  emit('update:modelValue', value)
}

const onTextInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  updateValue(target.value)
}

const toggleRecording = () => {
  isRecording.value = !isRecording.value

  if (isRecording.value) {
    activeModifiers.value.clear()
    updateValue('')
    // start capture from window to handle global key events
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
  } else {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
  }
}

const formatCombo = (modifiers: Set<string>, key?: string) => {
  const sortedModifiers = Array.from(modifiers).sort()
  if (key) {
    return sortedModifiers.length ? `${sortedModifiers.join('+')}+${key}` : key
  }
  return sortedModifiers.join('+')
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!isRecording.value) return
  event.preventDefault()
  event.stopPropagation()

  const modifier = modifierToken(event.code)
  if (modifier) {
    activeModifiers.value.add(modifier)
    updateValue(formatCombo(activeModifiers.value))
    return
  }

  const resolvedKey = normalizeKeyFromEvent(event)
  if (!resolvedKey) return

  const combo = formatCombo(activeModifiers.value, resolvedKey)
  updateValue(combo)

  // stop recording once a final key is chosen (e.g., ctrl+shift+P)
  isRecording.value = false
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp, true)
}

const onKeyUp = (event: KeyboardEvent) => {
  if (!isRecording.value) return
  event.preventDefault()
  event.stopPropagation()

  const modifier = modifierToken(event.code)
  if (modifier) {
    activeModifiers.value.delete(modifier)
    updateValue(formatCombo(activeModifiers.value))
  }
}

const clearCombo = () => {
  activeModifiers.value.clear()
  updateValue('')
}

const onFocus = () => {
  isFocused.value = true
}

const onBlur = () => {
  isFocused.value = false
  if (isRecording.value) {
    isRecording.value = false
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
  }
  activeModifiers.value.clear()
}
</script>

<style lang="postcss" scoped>
.keycombo-input {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.input-field {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
  background-color: var(--v-bg-input, #fff);
}

.clear-button {
  width: fit-content;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
  background: var(--v-btn-background, #f7f7f7);
  cursor: pointer;
}

.clear-button:hover {
  background: var(--v-btn-background-hover, #ececec);
}

.input-actions {
  display: flex;
  gap: 0.5rem;
}

.record-button {
  width: fit-content;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--v-border-color, #ccc);
  border-radius: 4px;
  background: var(--v-btn-background, #f7f7f7);
  cursor: pointer;
}

.record-button:hover {
  background: var(--v-btn-background-hover, #ececec);
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--v-text-muted, #555);
}
</style>
