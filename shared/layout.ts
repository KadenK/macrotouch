import type { Macro, MacroSpan } from './types/macro'
import type { MacroScreen, Position } from './types/screen'

/**
 * Where macros sit on a screen's grid.
 *
 * `macroRows` holds a macro's id in its top-left cell only; the other cells it
 * covers hold ''. So "is this cell free" can't be answered by reading the cell:
 * everything that places, moves or resizes a macro asks here. The master and the
 * editor both use it, so the editor can refuse a change before sending it.
 */

type Macros = Record<string, Pick<Macro, 'span'> | undefined>

const UNIT: MacroSpan = { rows: 1, columns: 1 }

/** A macro's span, with anything unusable read as one cell. */
export function spanOf(macro?: Pick<Macro, 'span'>): MacroSpan {
  const rows = macro?.span?.rows
  const columns = macro?.span?.columns
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows! < 1 || columns! < 1) return { ...UNIT }
  return { rows: rows!, columns: columns! }
}

export function isUnitSpan(span: MacroSpan): boolean {
  return span.rows === 1 && span.columns === 1
}

export interface PlacedMacro {
  macroId: string
  row: number
  column: number
  rows: number
  columns: number
}

export interface ScreenLayout {
  placements: PlacedMacro[]
  /** For each cell, the id of the macro covering it, or ''. */
  owner: string[][]
}

function isFree(owner: string[][], row: number, column: number, rows: number, columns: number): boolean {
  for (let r = row; r < row + rows; r++) {
    for (let c = column; c < column + columns; c++) {
      if (owner[r]?.[c]) return false
    }
  }
  return true
}

/**
 * Reads the grid row by row. Stored data can disagree with itself (a screen
 * shrunk under a big macro, a hand-edited file), so this always yields a layout
 * with no overlaps: a span running off the grid is cut to fit, one that runs
 * into another macro falls back to a single cell, and a macro whose own cell is
 * already covered is left out. A cell naming a macro that doesn't exist is empty.
 */
export function resolveLayout(screen: MacroScreen, macros: Macros): ScreenLayout {
  const { rows, columns } = screen.size
  const owner = Array.from({ length: rows }, () => Array<string>(columns).fill(''))
  const placements: PlacedMacro[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const macroId = screen.macroRows[r]?.macrosIds[c]
      // An id with no macro behind it is an empty cell, as the editor draws it.
      if (!macroId || !macros[macroId] || owner[r]![c]) continue

      const want = spanOf(macros[macroId])
      let spanRows = Math.min(want.rows, rows - r)
      let spanColumns = Math.min(want.columns, columns - c)
      if (!isFree(owner, r, c, spanRows, spanColumns)) {
        spanRows = 1
        spanColumns = 1
      }
      for (let rr = r; rr < r + spanRows; rr++) {
        for (let cc = c; cc < c + spanColumns; cc++) owner[rr]![cc] = macroId
      }
      placements.push({ macroId, row: r, column: c, rows: spanRows, columns: spanColumns })
    }
  }

  return { placements, owner }
}

/** Whether `macroId` could cover `span` from `anchor`, with the macros in `ignore` out of the way. */
export function fits(
  screen: MacroScreen,
  macros: Macros,
  macroId: string,
  anchor: Position,
  span: MacroSpan,
  ignore: string[] = [],
): boolean {
  const { rows, columns } = screen.size
  if (anchor.row < 0 || anchor.column < 0) return false
  if (anchor.row + span.rows > rows || anchor.column + span.columns > columns) return false

  const { owner } = resolveLayout(screen, macros)
  const skip = new Set([macroId, ...ignore])
  for (let r = anchor.row; r < anchor.row + span.rows; r++) {
    for (let c = anchor.column; c < anchor.column + span.columns; c++) {
      const id = owner[r]![c]
      if (id && !skip.has(id)) return false
    }
  }
  return true
}

/** The largest span up to `want` that fits, never smaller than one cell. */
export function largestFit(
  screen: MacroScreen,
  macros: Macros,
  macroId: string,
  anchor: Position,
  want: MacroSpan,
): MacroSpan {
  let columns = Math.max(1, want.columns)
  while (columns > 1 && !fits(screen, macros, macroId, anchor, { rows: 1, columns })) columns--
  let rows = Math.max(1, want.rows)
  while (rows > 1 && !fits(screen, macros, macroId, anchor, { rows, columns })) rows--
  return { rows, columns }
}

export interface Assignment {
  macroId: string
  from: Position
  to: Position
}

function overlaps(a: Position, aSpan: MacroSpan, b: Position, bSpan: MacroSpan): boolean {
  return (
    a.row < b.row + bSpan.rows &&
    b.row < a.row + aSpan.rows &&
    a.column < b.column + bSpan.columns &&
    b.column < a.column + aSpan.columns
  )
}

/**
 * Moving the macro whose top-left cell is `from` so its top-left cell is `to`.
 * It goes if the cells are free. If they hold exactly one other macro the two
 * swap places, provided each fits where the other was. Otherwise there is no
 * plan (null) and nothing should change.
 */
export function planMove(screen: MacroScreen, macros: Macros, from: Position, to: Position): Assignment[] | null {
  if (from.row === to.row && from.column === to.column) return null

  const layout = resolveLayout(screen, macros)
  const moving = layout.placements.find((p) => p.row === from.row && p.column === from.column)
  if (!moving) return null

  const movingSpan = { rows: moving.rows, columns: moving.columns }
  if (to.row < 0 || to.column < 0) return null
  if (to.row + movingSpan.rows > screen.size.rows || to.column + movingSpan.columns > screen.size.columns) return null

  const hit = new Set<string>()
  for (let r = to.row; r < to.row + movingSpan.rows; r++) {
    for (let c = to.column; c < to.column + movingSpan.columns; c++) {
      const id = layout.owner[r]![c]
      if (id && id !== moving.macroId) hit.add(id)
    }
  }

  if (hit.size === 0) return [{ macroId: moving.macroId, from, to }]
  if (hit.size > 1) return null

  const other = layout.placements.find((p) => p.macroId === [...hit][0])!
  const otherFrom = { row: other.row, column: other.column }
  const otherSpan = { rows: other.rows, columns: other.columns }
  if (!fits(screen, macros, moving.macroId, to, movingSpan, [other.macroId])) return null
  if (!fits(screen, macros, other.macroId, from, otherSpan, [moving.macroId])) return null
  if (overlaps(to, movingSpan, from, otherSpan)) return null

  return [
    { macroId: moving.macroId, from, to },
    { macroId: other.macroId, from: otherFrom, to: from },
  ]
}

/** Writes a plan into the grid. */
export function applyAssignments(screen: MacroScreen, assignments: Assignment[]): void {
  for (const a of assignments) screen.macroRows[a.from.row]!.macrosIds[a.from.column] = ''
  for (const a of assignments) screen.macroRows[a.to.row]!.macrosIds[a.to.column] = a.macroId
}

export interface Edges {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}

/**
 * Where a macro ends up when the given edges are dragged to the cell under the
 * pointer: each dragged edge follows the pointer, but never crosses the opposite
 * edge and never goes further than the free cells allow. The macro keeps at
 * least one cell.
 */
export function resizeRect(
  screen: MacroScreen,
  macros: Macros,
  macroId: string,
  start: { anchor: Position; span: MacroSpan },
  edges: Edges,
  pointer: Position,
): { anchor: Position; span: MacroSpan } {
  const row0 = start.anchor.row
  const col0 = start.anchor.column
  const row1 = row0 + start.span.rows - 1
  const col1 = col0 + start.span.columns - 1

  let top = edges.top ? Math.min(pointer.row, row1) : row0
  let bottom = edges.bottom ? Math.max(pointer.row, row0) : row1
  let left = edges.left ? Math.min(pointer.column, col1) : col0
  let right = edges.right ? Math.max(pointer.column, col0) : col1

  const ok = () =>
    fits(screen, macros, macroId, { row: top, column: left }, { rows: bottom - top + 1, columns: right - left + 1 })

  // Pull each dragged edge back toward where it started until the area is free.
  // Columns are settled with the original rows, then rows with the settled columns.
  const rowsBefore = [top, bottom]
  top = row0
  bottom = row1
  while (left < col0 && !ok()) left++
  while (right > col1 && !ok()) right--
  top = rowsBefore[0]!
  bottom = rowsBefore[1]!
  while (top < row0 && !ok()) top++
  while (bottom > row1 && !ok()) bottom--

  return { anchor: { row: top, column: left }, span: { rows: bottom - top + 1, columns: right - left + 1 } }
}
