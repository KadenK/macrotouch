<template>
  <div class="macro-container" :class="{ 'macro-container--hidden': isHiddenBlank }">
    <button v-if="mode === 'edit'" :type="'button'" class="macro edit" @click="openEditor">
      <component :is="display" v-if="macro" v-bind="displayProps" />
      <div v-else class="macro-display placeholder">
        <span class="placeholder-icon">+</span>
      </div>
    </button>

    <div v-else class="macro interact">
      <component :is="display" v-if="macro" v-bind="displayProps" @trigger="handleTrigger" />
      <div v-else class="macro-display placeholder">
        <!-- keep empty for non-edit mode -->
      </div>
    </div>

    <MacroEditModal
      v-if="mode === 'edit' && screenId && position"
      v-model="isModalOpen"
      :macro-id="macroId"
      :screen-id="screenId"
      :position="position"
      @saved="emit('update')"
      @deleted="emit('update')"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useMacroStore } from '~/stores/macro'
import MacroEditModal from './MacroEditModal.vue'
import { useMacroKind, type MacroDisplayProps } from '~/composables/useMacroKind'
import type { ActionStateValue, Macro, Position } from '~/../shared/types'

/**
 * One grid cell: an empty slot, or a macro drawn by the widget for its kind of
 * live state (see `composables/useMacroKind.ts`). In the editor a click opens
 * the macro's settings; on the remote the macro's own component decides when
 * it runs.
 */
const {
  mode,
  macroId = '',
  screenId = '',
  position = { row: 0, column: 0 },
} = defineProps<{
  mode: 'interact' | 'edit'
  macroId?: string
  screenId?: string
  position?: Position
}>()

const emit = defineEmits<{
  (e: 'update'): void
}>()

const store = useMacroStore()

const macro = computed<Macro | undefined>(() => (macroId ? store.getMacro(macroId) : undefined))

// On the remote client, a blank cell can be hidden so the screen background shows through.
// visibility (not v-if) keeps the cell's grid slot so other buttons stay in place.
const isHiddenBlank = computed(() => mode === 'interact' && !macro.value && store.settings.hideBlankButtons)

const display = computed(() => useMacroKind(macro.value?.stateKind).display)

const displayProps = computed<MacroDisplayProps | undefined>(() => {
  const m = macro.value
  if (!m) return undefined
  return {
    macro: m,
    mode,
    entry: mode === 'interact' ? store.getActionState(m) : undefined,
    // Labels follow the editor/remote setting.
    showLabel: mode === 'edit' ? store.settings.showEditorLabels : store.settings.showRemoteLabels,
  }
})

const isModalOpen = ref(false)

function openEditor() {
  isModalOpen.value = true
}

function handleTrigger(value?: ActionStateValue) {
  if (mode !== 'interact' || !macroId || !store.getMacro(macroId)) return
  store.triggerMacro(macroId, value)
}
</script>

<style scoped lang="postcss">
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.macro-container--hidden {
  visibility: hidden;
  pointer-events: none;
}

.macro {
  position: relative;
  overflow: hidden;
  padding: 0;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;

  &.interact {
    cursor: pointer;

    &:active {
      opacity: 0.8;
    }
  }

  &.edit {
    border: none;
    background-color: var(--color-cell);
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &:hover {
      background-color: var(--color-cell-hover);
    }
  }
}

.macro-display.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  aspect-ratio: 1/1;
  min-width: 50px;
  background-color: var(--color-cell);

  .placeholder-icon {
    font-size: 3rem;
    font-weight: 700;
    color: #3b82f6;
  }
}
</style>
