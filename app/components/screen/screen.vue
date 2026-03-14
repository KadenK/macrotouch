<!-- /app/components/screen/screen.vue -->
<template>
  <div
    class="macro-grid"
    :style="{
      gridTemplateColumns: `repeat(${screen?.size.columns || 1}, 1fr)`,
      gridTemplateRows: `repeat(${screen?.size.rows || 1}, auto)`,
    }"
  >
    <template v-if="screen">
      <component
        :is="editable ? MacroEdit : MacroInteract"
        v-for="(macro, index) in cellMacros"
        :key="index"
        :macro-id="macro?.id"
        :screen-id="screen.id"
        :position="getPositionFromIndex(index)"
        :label="macro?.name"
        :icon="macro?.icon"
        :icon-color="macro?.iconColor"
        :background-color="macro?.backgroundColor"
        :editable="editable"
        @click="handleCellClick(index)"
        class="grid-item"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroEdit from '../macro/macroEdit.vue'
import MacroInteract from '../macro/macroInteract.vue'
import type { Position } from '~/../types'

const props = withDefaults(
  defineProps<{
    screenId: string
    editable?: boolean
  }>(),
  {
    editable: false,
  },
)

const emit = defineEmits<{
  (e: 'edit-macro', position: Position): void
}>()

const store = useMacroStore()
const { screens } = storeToRefs(store)

const screen = computed(() => screens.value[props.screenId])

// Flatten the grid into a list of macro objects (or undefined for empty)
const cellMacros = computed(() => {
  if (!screen.value) return []
  const rows = screen.value.macroRows
  const result: Array<ReturnType<typeof store.getMacroAt> | undefined> = []
  for (let r = 0; r < screen.value.size.rows; r++) {
    const row = rows[r]
    if (!row) continue
    for (let c = 0; c < screen.value.size.columns; c++) {
      const macroId = row.macrosIds[c]
      if (macroId) {
        result.push(store.getMacro(macroId))
      } else {
        result.push(undefined)
      }
    }
  }
  return result
})

function getPositionFromIndex(index: number): Position {
  if (!screen.value) return { row: 0, column: 0 }
  const cols = screen.value.size.columns
  return {
    row: Math.floor(index / cols),
    column: index % cols,
  }
}

function handleCellClick(index: number) {
  if (!props.editable) return
  const pos = getPositionFromIndex(index)
  emit('edit-macro', pos)
}
</script>

<style scoped>
.macro-grid {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  background-color: #e9e9e9;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.grid-item {
  width: 100%;
  height: auto;
}
</style>
