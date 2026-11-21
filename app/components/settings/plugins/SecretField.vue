<template>
  <div class="secret-field">
    <!--
      Write-only: the value never comes back to the editor, only its length and, if long
      enough, its last characters, shown as stars. Focusing clears it to type a new one,
      shown as typed; Save (or Enter) stores it and hides it again, Escape cancels.
    -->
    <input
      ref="input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="draft ?? masked"
      :disabled="disabled"
      :aria-label="label"
      @focus="draft ??= ''"
      @input="draft = ($event.target as HTMLInputElement).value"
      @blur="!draft && (draft = undefined)"
      @keydown.enter="save"
      @keydown.escape="cancel"
    />
    <!-- mousedown.prevent keeps focus, so the field's blur doesn't drop the draft before the click. -->
    <button v-if="draft" type="button" :disabled="disabled" @mousedown.prevent @click="save">Save</button>
    <button v-else-if="isSet" type="button" :disabled="disabled" @click="emit('save', null)">Clear</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SecretHint } from '~/../shared/types'

/**
 * One plugin secret. `hints` is what each connected action server says about
 * its saved value; emits `save` with a new value, or `null` to clear it.
 */
const props = defineProps<{ label: string; hints: (SecretHint | null)[]; disabled: boolean }>()
const emit = defineEmits<{ save: [value: string | null] }>()

const input = ref<HTMLInputElement>()
/** A new value being typed, shown in place of the saved one's stars until saved or dropped. */
const draft = ref<string>()

/** Set once every connected action server has it. */
const isSet = computed(() => props.hints.length > 0 && props.hints.every(Boolean))
/**
 * The saved secret as `✱` per character with its last few shown, e.g.
 * `✱✱✱✱✱✱✱✱✱✱✱✱abc`. Empty when not set; plain stars when the action servers' values differ.
 */
const masked = computed(() => {
  if (!isSet.value) return ''
  const [first, ...rest] = props.hints as SecretHint[]
  if (rest.some((hint) => hint.length !== first!.length || hint.end !== first!.end)) return '✱'.repeat(8)
  const end = first!.end ?? ''
  return '✱'.repeat(Math.min(first!.length - end.length, 40)) + end
})

function save() {
  if (!draft.value) return
  emit('save', draft.value)
  draft.value = undefined
  // The field keeps focus through the Save click; leaving it shows the stars again.
  input.value?.blur()
}
function cancel() {
  draft.value = undefined
  input.value?.blur()
}
</script>

<style scoped>
.secret-field {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
/* Matches the other controls in PluginConfigure. */
input,
button {
  min-width: 0;
  color: var(--color-text-strong);
  background: var(--color-input-bg);
  border: var(--border-width) solid var(--color-input-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font-size: var(--text-sm);
}
button {
  cursor: pointer;
}
button:disabled,
input:disabled {
  cursor: not-allowed;
}
input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
