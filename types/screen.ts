import type { Color } from './common'

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

export class MacroScreen {
  id: string
  name: string
  private _size: ScreenSize
  backgroundColor: Color
  macroRows: ScreenRow[]
  defaultMacroIconColor?: Color
  defaultMacroBackgroundColor?: Color

  constructor(
    name: string,
    size: ScreenSize,
    backgroundColor: Color,
    macroRows?: ScreenRow[],
    defaultMacroIconColor?: Color,
    defaultMacroBackgroundColor?: Color,
    id?: string,
  ) {
    if (macroRows && (size.rows !== macroRows?.length || size.columns !== macroRows?.[0]?.macrosIds.length)) {
      throw new Error(
        `Provided macroRows do not match the specified screen size. Expected: ${size.rows}x${size.columns} but macroRows contains: ${macroRows.length}x${macroRows[0]?.macrosIds.length}`,
      )
    }

    this.id = id || crypto.randomUUID()
    this.name = name
    this._size = size
    this.backgroundColor = backgroundColor
    this.defaultMacroIconColor = defaultMacroIconColor
    this.defaultMacroBackgroundColor = defaultMacroBackgroundColor
    this.macroRows = macroRows || this._createEmptyRows()
  }

  get size(): ScreenSize {
    return this._size
  }

  set size(newSize: ScreenSize) {
    if (newSize.rows < 1 || newSize.columns < 1) {
      throw new Error('Screen size must have at least 1 row and 1 column')
    }
    this._size = newSize
    // If the new size has more rows, add empty rows
    while (this.macroRows.length < newSize.rows) {
      this.macroRows.push({ macrosIds: Array(newSize.columns).fill('') })
    }
    // If the new size has fewer rows, remove extra rows
    if (this.macroRows.length > newSize.rows) {
      this.macroRows = this.macroRows.slice(0, newSize.rows)
    }
    // Adjust columns in each row
    for (const row of this.macroRows) {
      while (row.macrosIds.length < newSize.columns) {
        row.macrosIds.push('')
      }
      if (row.macrosIds.length > newSize.columns) {
        row.macrosIds = row.macrosIds.slice(0, newSize.columns)
      }
    }
  }

  private _createEmptyRows(): ScreenRow[] {
    const rows: ScreenRow[] = Array(this.size.rows)
      .fill(0)
      .map(() => ({ macrosIds: Array(this.size.columns).fill('') }))

    return rows
  }
}

export interface ScreenListItem {
  id: string
  name: string
}
