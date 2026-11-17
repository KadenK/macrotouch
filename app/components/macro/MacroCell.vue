<template>
  <div
    class="macro-container"
    :class="{
      'macro-container--hidden': isHiddenBlank,
      'macro-container--dragging': isDragging,
      'macro-container--resizing': resizing,
    }"
    :draggable="mode === 'edit' && !!macro && !resizing"
    @dragstart="isDragging = true"
    @dragend="isDragging = false"
  >
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

    <!--
      Editor only. A border shows where the macro ends even when it matches the
      background; the handle resizes it. Siblings of the button, so grabbing the
      handle never opens the editor.
    -->
    <template v-if="mode === 'edit' && macro">
      <div class="resize-frame" />
      <div
        v-for="zone in zones"
        :key="zone.name"
        :class="['resize-zone', `resize-zone--${zone.name}`]"
        draggable="false"
        @mousedown.prevent.stop
        @pointerdown.prevent.stop="emit('resize-start', $event, zone.edges)"
      />
    </template>

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
import type { Edges } from '~/../shared/layout'
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
  resizing = false,
} = defineProps<{
  mode: 'interact' | 'edit'
  macroId?: string
  screenId?: string
  position?: Position
  /** This macro is being resized, which keeps its border and handle showing. */
  resizing?: boolean
}>()

const emit = defineEmits<{
  (e: 'update'): void
  (e: 'resize-start', event: PointerEvent, edges: Edges): void
}>()

const zones: { name: string; edges: Edges }[] = [
  { name: 'top', edges: { top: true } },
  { name: 'bottom', edges: { bottom: true } },
  { name: 'left', edges: { left: true } },
  { name: 'right', edges: { right: true } },
  { name: 'top-left', edges: { top: true, left: true } },
  { name: 'top-right', edges: { top: true, right: true } },
  { name: 'bottom-left', edges: { bottom: true, left: true } },
  { name: 'bottom-right', edges: { bottom: true, right: true } },
]

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

// Moving is handled by the screen, which knows the grid. This only dims the macro being carried.
const isDragging = ref(false)

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
  position: relative;
}

.macro-container--dragging {
  opacity: 0.4;
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
  height: 100%;
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
  min-width: 50px;
  background-color: var(--color-cell);

  .placeholder-icon {
    font-size: 3rem;
    font-weight: 700;
    color: #3b82f6;
  }
}

/* A subtle border on hover, so the macro's edge shows even when it matches the background. */
.resize-frame {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgb(128 128 128 / 0.45);
  opacity: 0;
  transition: opacity 0.1s ease;
}

/* Invisible grab zones on every edge and corner; only the bottom-right one draws a grip. */
.resize-zone {
  position: absolute;
  z-index: 3;
  touch-action: none;
}

.resize-zone--top,
.resize-zone--bottom {
  left: 10px;
  right: 10px;
  height: 8px;
  cursor: ns-resize;
}

.resize-zone--left,
.resize-zone--right {
  top: 10px;
  bottom: 10px;
  width: 8px;
  cursor: ew-resize;
}

.resize-zone--top {
  top: 0;
}

.resize-zone--bottom {
  bottom: 0;
}

.resize-zone--left {
  left: 0;
}

.resize-zone--right {
  right: 0;
}

.resize-zone--top-left,
.resize-zone--top-right,
.resize-zone--bottom-left,
.resize-zone--bottom-right {
  right: 0;
  bottom: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  /* Three diagonal strokes, set in from the corner. */
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 11 11' fill='none' stroke='%23808080' stroke-opacity='0.7' stroke-width='1.2' stroke-linecap='round'%3E%3Cpath d='M8 1L1 8M9 3L3 9M10 5L5 10'/%3E%3C/svg%3E")
    right 4px bottom 4px / 11px 11px no-repeat;
  opacity: 0;
  transition: opacity 0.1s ease;
}

.resize-zone--top-right {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.resize-zone--bottom-left {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.macro-container:hover:not(.macro-container--dragging) .resize-frame,
.macro-container:hover:not(.macro-container--dragging) .resize-zone--bottom-right,
.macro-container--resizing .resize-frame,
.macro-container--resizing .resize-zone--bottom-right {
  opacity: 1;
}
</style>
