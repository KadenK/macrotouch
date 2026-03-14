// /types/screen.ts
import { Color } from './common'

export interface ScreenSize {
  rows: number
  columns: number
}

export interface Position {
  row: number
  column: number
}

export interface ScreenRow {
  macrosIds: string[] // empty string = no macro
}

// Plain data object for a screen
export interface ScreenData {
  id: string
  name: string
  size: ScreenSize
  backgroundColor: Color
  macroRows: ScreenRow[]
  defaultMacroIconColor?: Color
  defaultMacroBackgroundColor?: Color
}

// Factory function to create a new screen with empty cells
export function createScreen(
  name: string,
  rows: number,
  columns: number,
  backgroundColor: Color = new Color(240, 240, 240),
): ScreenData {
  const macroRows: ScreenRow[] = Array(rows)
    .fill(null)
    .map(() => ({ macrosIds: Array(columns).fill('') }))

  return {
    id: crypto.randomUUID(),
    name,
    size: { rows, columns },
    backgroundColor,
    macroRows,
  }
}

// Used for screen list displays
export interface ScreenListItem {
  id: string
  name: string
}
