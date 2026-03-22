<template>
  <div
    class="macro-grid"
    :style="{
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      backgroundColor: screen ? colorToHex(screen.backgroundColor) : '#e9e9e9',
      '--label-color': screen ? getContrastColor(screen.backgroundColor) : '#000000',
    }"
  >
    <template v-if="screen">
      <template v-if="editable">
        <MacroEdit
          v-for="(macroId, index) in cellMacroIds"
          :key="`edit-${screen.id}-${getPositionFromIndex(index).row}-${getPositionFromIndex(index).column}`"
          :macro-id="macroId"
          :screen-id="screen.id"
          :position="getPositionFromIndex(index)"
          :editable="true"
          class="grid-item"
        />
      </template>
      <template v-else>
        <MacroInteract
          v-for="(macroId, index) in cellMacroIds"
          :key="`view-${screen.id}-${getPositionFromIndex(index).row}-${getPositionFromIndex(index).column}`"
          :macro-id="macroId"
          class="grid-item"
        />
      </template>
    </template>
    <div v-else class="no-screen">No screen found.</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroEdit from '../macro/macroEdit.vue'
import MacroInteract from '../macro/macroInteract.vue'
import type { Position } from '~/../types'
import { colorToHex, getContrastColor } from '~/../types'

const props = defineProps<{
  screenId: string
  editable?: boolean
}>()

const store = useMacroStore()
const { screens } = storeToRefs(store)

const screen = computed(() => screens.value[props.screenId])

const rows = computed(() => screen.value?.size?.rows ?? 0)
const columns = computed(() => screen.value?.size?.columns ?? 0)

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
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.grid-item {
  width: 100%;
  height: 100%;
}

.no-screen {
  padding: 1rem;
  text-align: center;
  color: #6b7280;
}
</style>
