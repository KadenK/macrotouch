<template>
  <div class="macro-container" :class="{ 'macro-container--hidden': isHiddenBlank }">
    <button v-if="mode === 'edit'" :type="'button'" class="macro edit" @click="openEditor">
      <div v-if="macro" class="macro-display" :style="{ backgroundColor: colorToHex(macro.backgroundColor) }">
        <Icon
          :name="macro.icon.source === 'LIBRARY' ? normalizeIconValue(macro.icon.value) : ''"
          class="macro-icon"
          :style="{ color: colorToHex(macro.iconColor) }"
        />
      </div>
      <div v-else class="macro-display placeholder">
        <span class="placeholder-icon">+</span>
      </div>
    </button>

    <div v-else class="macro interact" @click="handleTrigger">
      <div v-if="macro" class="macro-display" :style="{ backgroundColor: colorToHex(macro.backgroundColor) }">
        <Icon
          :name="macro.icon.source === 'LIBRARY' ? normalizeIconValue(macro.icon.value) : ''"
          class="macro-icon"
          :style="{ color: colorToHex(macro.iconColor) }"
        />
      </div>
      <div v-else class="macro-display placeholder">
        <!-- keep empty for non-edit mode -->
      </div>
    </div>

    <span v-if="macro || mode === 'edit'" class="macro-label">
      {{ macro?.name || (mode === 'edit' ? 'Empty' : '') }}
    </span>

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
import { normalizeIconValue } from '~/composables/useIconData'
import type { Macro, Position } from '~/../shared/types'
import { colorToHex } from '~/../shared/types'

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

const macro = computed<Macro | undefined>(() =>
  (macroId && mode === 'interact') || (macroId && mode === 'edit') ? store.getMacro(macroId) : undefined,
)

// On the remote client, a blank cell can be hidden so the screen background shows through.
// visibility (not v-if) keeps the cell's grid slot so other buttons stay in place.
const isHiddenBlank = computed(() => mode === 'interact' && !macro.value && store.settings.hideBlankButtons)

const isModalOpen = ref(false)

function openEditor() {
  isModalOpen.value = true
}

function handleTrigger() {
  if (mode !== 'interact' || !macroId) return
  const currentMacro = store.getMacro(macroId)
  if (!currentMacro) return
  store.triggerMacro(macroId)
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
    background-color: #cfcfcf;
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &:hover {
      background-color: #bdbdbd;
    }
  }
}

.macro-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;

  &.placeholder {
    aspect-ratio: 1/1;
    min-width: 50px;
    background-color: #cfcfcf;
  }

  .placeholder-icon {
    font-size: 3rem;
    font-weight: 700;
    color: #3b82f6;
  }

  .macro-icon {
    width: 75%;
    height: 75%;
    min-width: 50px;
    aspect-ratio: 1/1;
    font-size: 28px;
  }
}

.macro-label {
  font-size: 0.75rem;
  color: var(--label-color, #333);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
