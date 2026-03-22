<template>
  <div
    class="macro-grid"
    :style="{
      '--columns': columns,
      '--rows': rows,
      backgroundColor: screen ? colorToHex(screen.backgroundColor) : '#e9e9e9',
      '--label-color': screen ? getContrastColor(screen.backgroundColor) : '#000000',
    }"
  >
    <template v-if="screen">
      <MacroCell
        v-for="(macroId, index) in cellMacroIds"
        :key="`${editable ? 'edit' : 'view'}-${screen.id}-${getPositionFromIndex(index).row}-${getPositionFromIndex(index).column}`"
        :mode="editable ? 'edit' : 'interact'"
        :macro-id="macroId"
        :screen-id="screen.id"
        :position="getPositionFromIndex(index)"
        class="grid-item"
      />
    </template>
    <div v-else class="no-screen">No screen found.</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroCell from '../macro/MacroCell.vue'
import type { Position } from '~/../types'
import { colorToHex, getContrastColor } from '~/../types'

const props = defineProps<{
  screenId: string
  editable?: boolean
}>()

const store = useMacroStore()
const { screens } = storeToRefs(store)

const screen = computed(() => screens.value[props.screenId])

const rows = computed(() => Math.max(1, screen.value?.size?.rows ?? 1))
const columns = computed(() => Math.max(1, screen.value?.size?.columns ?? 1))

const cellMacroIds = computed(() => {
  if (!screen.value) return []

  const result: string[] = []
  for (let r = 0; r < screen.value.size.rows; r++) {
    const row = screen.value.macroRows[r]
    for (let c = 0; c < screen.value.size.columns; c++) {
      result.push(row?.macrosIds[c] || '')
    }
  }
  return result
})

function getPositionFromIndex(index: number): Position {
  return { row: Math.floor(index / columns.value), column: index % columns.value }
}
</script>

<style scoped>
.macro-grid {
  --gap: 0.75rem;
  --padding: 0.75rem;
  --columns: 1;
  --rows: 1;
  --available-width: calc(100vw - 2 * var(--padding) - (var(--columns) - 1) * var(--gap));
  --available-height: calc(100vh - 2 * var(--padding) - (var(--rows) - 1) * var(--gap));
  --cell-size: min(calc(var(--available-width) / var(--columns)), calc(var(--available-height) / var(--rows)));

  display: grid;
  gap: var(--gap);
  padding: var(--padding);
  border-radius: 12px;
  width: calc(var(--cell-size) * var(--columns) + (var(--columns) - 1) * var(--gap) + 2 * var(--padding));
  height: calc(var(--cell-size) * var(--rows) + (var(--rows) - 1) * var(--gap) + 2 * var(--padding));
  max-width: 100vw;
  max-height: 100vh;
  min-width: 0;
  min-height: 0;
  margin: auto;
  box-sizing: border-box;
  overflow: hidden;
  grid-template-columns: repeat(var(--columns), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  align-content: center;
  justify-content: center;
  place-items: stretch;
}

.grid-item {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  aspect-ratio: 1 / 1;
}

.no-screen {
  padding: 1rem;
  text-align: center;
  color: #6b7280;
}
</style>
