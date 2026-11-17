<template>
  <div
    ref="gridEl"
    class="macro-grid"
    :style="{
      '--columns': columns,
      '--rows': rows,
      backgroundColor: screen ? colorToHex(screen.backgroundColor) : '#e9e9e9',
      '--label-color': screen ? getContrastColor(screen.backgroundColor) : '#000000',
    }"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @dragend="clearDrag"
  >
    <template v-if="screen">
      <!-- One invisible square per row, so rows are as tall as columns are wide whichever cells are covered. -->
      <div v-for="row in rows" :key="`sizer-${row}`" class="row-sizer" :style="{ gridRow: row, gridColumn: 1 }" />
      <MacroCell
        v-for="cell in cells"
        :key="`${editable ? 'edit' : 'view'}-${screen.id}-${cell.row}-${cell.column}`"
        :mode="editable ? 'edit' : 'interact'"
        :macro-id="cell.macroId"
        :screen-id="screen.id"
        :position="{ row: cell.row, column: cell.column }"
        :resizing="!!cell.macroId && resizing?.macroId === cell.macroId"
        :data-row="cell.row"
        :data-column="cell.column"
        class="grid-item"
        :style="areaStyle(cell)"
        @resize-start="(event, edges) => startResize(cell, event, edges)"
      />
      <!-- Where a dragged or resized macro would land. -->
      <div v-if="preview" class="area-preview" :style="areaStyle(preview)" />
    </template>
    <div v-else class="no-screen">No screen found.</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroCell from '../macro/MacroCell.vue'
import type { Edges } from '~/../shared/layout'
import type { MacroSpan, Position } from '~/../shared/types'
import { colorToHex, getContrastColor } from '~/../shared/types'
import { planMove, resizeRect, resolveLayout } from '~/../shared/layout'

const props = defineProps<{
  screenId: string
  editable?: boolean
}>()

const store = useMacroStore()
const { screens, macros } = storeToRefs(store)

const screen = computed(() => screens.value[props.screenId])

const rows = computed(() => Math.max(1, screen.value?.size?.rows ?? 1))
const columns = computed(() => Math.max(1, screen.value?.size?.columns ?? 1))

interface Area {
  row: number
  column: number
  rows: number
  columns: number
}

interface GridCell extends Area {
  /** '' for an empty cell. */
  macroId: string
}

/**
 * What to draw: each macro once, at its top-left cell and as big as its span,
 * and every empty cell. Cells a macro covers are not drawn.
 */
const cells = computed<GridCell[]>(() => {
  if (!screen.value) return []
  const layout = resolveLayout(screen.value, macros.value)
  const anchors = new Map(layout.placements.map((p) => [`${p.row}:${p.column}`, p]))

  const result: GridCell[] = []
  for (let r = 0; r < layout.owner.length; r++) {
    for (let c = 0; c < layout.owner[r]!.length; c++) {
      if (!layout.owner[r]![c]) {
        result.push({ macroId: '', row: r, column: c, rows: 1, columns: 1 })
        continue
      }
      const placed = anchors.get(`${r}:${c}`)
      if (placed) result.push({ ...placed })
    }
  }
  return result
})

function areaStyle(area: Area) {
  return {
    gridRow: `${area.row + 1} / span ${area.rows}`,
    gridColumn: `${area.column + 1} / span ${area.columns}`,
  }
}

/* ------------------------------------------------------------ pointer to cell */

const gridEl = ref<HTMLElement | null>(null)

/** The cell under a point, clamped to the grid. Read from the laid-out grid, so it follows any sizing. */
function cellAt(clientX: number, clientY: number): Position | null {
  const el = gridEl.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const padLeft = parseFloat(style.paddingLeft) || 0
  const padRight = parseFloat(style.paddingRight) || 0
  const padTop = parseFloat(style.paddingTop) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const gapX = parseFloat(style.columnGap) || 0
  const gapY = parseFloat(style.rowGap) || 0

  const cellW = (rect.width - padLeft - padRight - (columns.value - 1) * gapX) / columns.value
  const cellH = (rect.height - padTop - padBottom - (rows.value - 1) * gapY) / rows.value
  const column = Math.floor((clientX - rect.left - padLeft + gapX / 2) / (cellW + gapX))
  const row = Math.floor((clientY - rect.top - padTop + gapY / 2) / (cellH + gapY))
  return {
    row: Math.min(rows.value - 1, Math.max(0, row)),
    column: Math.min(columns.value - 1, Math.max(0, column)),
  }
}

/* ---------------------------------------------------------------------- move */

const DRAG_TYPE = 'application/x-macrotouch-cell'

/** `offset` is where in the macro it was picked up, so it lands under the pointer where it was held. */
const dragging = ref<{ from: Position; offset: Position } | null>(null)
const dropArea = ref<(Area & { to: Position }) | null>(null)

function cellOf(target: EventTarget | null): Position | null {
  const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-row]')
  return el ? { row: Number(el.dataset.row), column: Number(el.dataset.column) } : null
}

function onDragStart(event: DragEvent) {
  const from = cellOf(event.target)
  const grabbed = cellAt(event.clientX, event.clientY)
  if (!props.editable || resizing.value || !from || !grabbed || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(DRAG_TYPE, '1')
  dragging.value = {
    from,
    offset: { row: Math.max(0, grabbed.row - from.row), column: Math.max(0, grabbed.column - from.column) },
  }
}

function onDragOver(event: DragEvent) {
  const drag = dragging.value
  const current = screen.value
  const pointer = cellAt(event.clientX, event.clientY)
  if (!drag || !current || !pointer) return

  const to = {
    row: Math.max(0, pointer.row - drag.offset.row),
    column: Math.max(0, pointer.column - drag.offset.column),
  }
  const plan = planMove(current, macros.value, drag.from, to)
  const moving = resolveLayout(current, macros.value).placements.find(
    (p) => p.row === drag.from.row && p.column === drag.from.column,
  )
  if (!plan || !moving) {
    dropArea.value = null
    return
  }
  // Only a valid landing spot accepts the drop.
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropArea.value = { ...to, rows: moving.rows, columns: moving.columns, to }
}

function onDragLeave(event: DragEvent) {
  if (!gridEl.value?.contains(event.relatedTarget as Node | null)) dropArea.value = null
}

function onDrop(event: DragEvent) {
  const drag = dragging.value
  const area = dropArea.value
  clearDrag()
  if (!drag || !area) return
  event.preventDefault()
  store.moveMacro(props.screenId, drag.from, area.to)
}

function clearDrag() {
  dragging.value = null
  dropArea.value = null
}

/* -------------------------------------------------------------------- resize */

const resizing = ref<{
  macroId: string
  start: { anchor: Position; span: MacroSpan }
  edges: Edges
  anchor: Position
  span: MacroSpan
} | null>(null)

function startResize(cell: GridCell, event: PointerEvent, edges: Edges) {
  if (!props.editable || !cell.macroId) return
  resizing.value = {
    macroId: cell.macroId,
    start: { anchor: { row: cell.row, column: cell.column }, span: { rows: cell.rows, columns: cell.columns } },
    edges,
    anchor: { row: cell.row, column: cell.column },
    span: { rows: cell.rows, columns: cell.columns },
  }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', cancelResize)
  window.addEventListener('keydown', onResizeKey)
  onResizeMove(event)
}

function onResizeMove(event: PointerEvent) {
  const active = resizing.value
  const current = screen.value
  const pointer = cellAt(event.clientX, event.clientY)
  if (!active || !current || !pointer) return
  // The dragged edges follow the pointer, but never past what is free.
  const next = resizeRect(current, macros.value, active.macroId, active.start, active.edges, pointer)
  active.anchor = next.anchor
  active.span = next.span
}

function endResize() {
  const active = resizing.value
  stopResizeListeners()
  if (!active) return
  resizing.value = null
  store.resizeMacro(props.screenId, active.start.anchor, active.span, active.anchor)
}

function cancelResize() {
  stopResizeListeners()
  resizing.value = null
}

function onResizeKey(event: KeyboardEvent) {
  if (event.key === 'Escape') cancelResize()
}

function stopResizeListeners() {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', cancelResize)
  window.removeEventListener('keydown', onResizeKey)
}

onBeforeUnmount(stopResizeListeners)

const preview = computed<Area | null>(() => {
  const active = resizing.value
  if (active) return { ...active.anchor, ...active.span }
  return dropArea.value
})
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
  /* minmax(0, ...) so a macro's content can never stretch a track past the size the grid was given. */
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
  align-content: center;
  justify-content: center;
  place-items: stretch;
}

.row-sizer {
  width: 100%;
  aspect-ratio: 1 / 1;
  visibility: hidden;
  pointer-events: none;
}

.grid-item {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* Size comes from the grid area alone; a macro's content never stretches a row or column. */
  contain: size;
}

/* Over the cells a macro would cover, in a color that reads on any background. */
.area-preview {
  z-index: 2;
  pointer-events: none;
  border-radius: 8px;
  background-color: rgb(59 130 246 / 0.25);
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 4px #3b82f6;
}

.no-screen {
  padding: 1rem;
  text-align: center;
  color: var(--color-text-subtle);
}
</style>
