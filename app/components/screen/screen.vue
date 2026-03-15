<template>
  <div
    class="macro-grid"
    :style="{
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, auto)`,
    }"
  >
    <!-- Dummy data mode (items prop) -->
    <template v-if="items">
      <component
        :is="editable ? MacroEdit : MacroInteract"
        v-for="(item, index) in items"
        :key="item.id || index"
        :macro-id="item.id"
        :screen-id="''"
        :position="{ row: Math.floor(index / columns), column: index % columns }"
        :label="item.label"
        :icon="item.icon"
        :icon-color="null"
        :background-color="null"
        :editable="editable"
        class="grid-item"
        @click="handleItemClick(index)"
      />
    </template>

    <!-- Store mode (screenId) -->
    <template v-else-if="screen">
      <!-- Edit mode -->
      <template v-if="editable">
        <MacroEdit
          v-for="(macro, index) in cellMacros"
          :key="index"
          :macro-id="macro?.id"
          :screen-id="screen.id"
          :position="getPositionFromIndex(index)"
          :editable="true"
          class="grid-item"
          @click="handleCellClick(index)"
        />
      </template>

      <!-- View mode -->
      <template v-else>
        <MacroInteract
          v-for="(macro, index) in cellMacros"
          :key="index"
          :macro="macro"
          class="grid-item"
          @click="(id) => handleMacroClick(id)"
        />
      </template>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroEdit from '../macro/macroEdit.vue'
import MacroInteract from '../macro/macroInteract.vue'
import type { Position } from '~/../types'

const props = withDefaults(
  defineProps<{
    screenId?: string // for store mode
    items?: any[] // for dummy mode
    columns?: number
    rows?: number
    editable?: boolean
  }>(),
  {
    columns: 5,
    rows: 3,
    editable: false,
  },
)

const emit = defineEmits<{
  (e: 'edit-macro', position: Position): void
  (e: 'item-click', index: number): void
  (e: 'macro-click', macroId: string): void
}>()

const store = useMacroStore()
const { screens, macros } = storeToRefs(store)

// Log when props change
watch(
  () => props.screenId,
  (newId) => {
    console.log('🆔 screenId prop changed to:', newId)
  },
)

// Store mode: get screen from store
const screen = computed(() => {
  if (!props.screenId) {
    console.log('⚠️ No screenId provided')
    return null
  }
  const s = screens.value[props.screenId]
  console.log('📺 Screen from store:', s ? `${s.id} - ${s.name}` : 'undefined')
  return s
})

// Flatten grid for store mode
const cellMacros = computed(() => {
  console.log('🔍 Computing cellMacros')
  if (!screen.value) {
    console.log('  ❌ screen.value is null')
    return []
  }
  console.log('  ✅ screen.value exists:', screen.value.id, screen.value.name)
  console.log('  📊 screen.value.macroRows:', JSON.stringify(screen.value.macroRows, null, 2))

  const rows = screen.value.macroRows
  const result: Array<ReturnType<typeof store.getMacroAt> | undefined> = []

  for (let r = 0; r < screen.value.size.rows; r++) {
    const row = rows[r]
    if (!row) {
      console.log(`  ⚠️ Row ${r} is undefined`)
      continue
    }
    for (let c = 0; c < screen.value.size.columns; c++) {
      const macroId = row.macrosIds[c]
      console.log(`  🔎 Cell (${r},${c}): macroId = "${macroId}"`)
      if (macroId) {
        const macro = store.getMacro(macroId)
        console.log(`    → macro object:`, macro ? `${macro.name} (${macro.id})` : 'undefined')
        result.push(macro)
      } else {
        result.push(undefined)
      }
    }
  }
  console.log('  📦 Final cellMacros length:', result.length)
  return result
})

function getPositionFromIndex(index: number): Position {
  if (!screen.value) return { row: 0, column: 0 }
  const cols = screen.value.size.columns
  return { row: Math.floor(index / cols), column: index % cols }
}

function handleCellClick(index: number) {
  if (!props.editable) return
  const pos = getPositionFromIndex(index)
  emit('edit-macro', pos)
}

function handleMacroClick(macroId: string) {
  emit('macro-click', macroId)
}

// Dummy mode: click handler
function handleItemClick(index: number) {
  if (props.editable) {
    emit('item-click', index)
  }
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