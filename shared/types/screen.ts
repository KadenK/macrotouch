import type { Color } from './common'
import { createColor } from './common'

export interface ScreenSize {
  rows: number
  columns: number
}

export interface Position {
  row: number
  column: number
}

export interface ScreenRow {
  macrosIds: string[]
}

export interface MacroScreen {
  id: string
  name: string
  size: ScreenSize
  backgroundColor: Color
  macroRows: ScreenRow[]
  defaultMacroIconColor?: Color
  defaultMacroBackgroundColor?: Color
}

export function createMacroScreen(
  name = 'Screen',
  size: ScreenSize = { rows: 3, columns: 4 },
  backgroundColor: Color = createColor(240, 240, 240),
  defaultMacroIconColor?: Color,
  defaultMacroBackgroundColor?: Color,
  id?: string,
): MacroScreen {
  const generatedId = id || crypto.randomUUID()
  const rows: ScreenRow[] = Array(size.rows)
    .fill(0)
    .map(() => ({ macrosIds: Array(size.columns).fill('') }))

  return {
    id: generatedId,
    name,
    size,
    backgroundColor,
    macroRows: rows,
    defaultMacroIconColor,
    defaultMacroBackgroundColor,
  }
}

export interface ScreenListItem {
  id: string
  name: string
}
