/* eslint-disable @typescript-eslint/no-explicit-any */
// /app/stores/macro.ts
import { defineStore } from 'pinia'
import type { MacroData, ScreenData, Position, ScreenListItem, ScreenRow } from '~/../types'
import { Color } from '~/../types/common'

const STORAGE_KEY = 'macro-app-data'

interface PersistedState {
  macros: Record<string, MacroData>
  screens: Record<string, ScreenData>
}

export const useMacroStore = defineStore('Macro', () => {
  // Load initial state from localStorage
  const loadState = (): PersistedState => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Reconstruct Color instances from plain objects
        if (parsed.macros) {
          Object.values(parsed.macros).forEach((m: any) => {
            if (m.iconColor && !(m.iconColor instanceof Color)) {
              m.iconColor = new Color(m.iconColor.r, m.iconColor.g, m.iconColor.b)
            }
            if (m.backgroundColor && !(m.backgroundColor instanceof Color)) {
              m.backgroundColor = new Color(m.backgroundColor.r, m.backgroundColor.g, m.backgroundColor.b)
            }
          })
        }
        if (parsed.screens) {
          Object.values(parsed.screens).forEach((s: any) => {
            if (s.backgroundColor && !(s.backgroundColor instanceof Color)) {
              s.backgroundColor = new Color(s.backgroundColor.r, s.backgroundColor.g, s.backgroundColor.b)
            }
            if (s.defaultMacroIconColor && !(s.defaultMacroIconColor instanceof Color)) {
              s.defaultMacroIconColor = new Color(
                s.defaultMacroIconColor.r,
                s.defaultMacroIconColor.g,
                s.defaultMacroIconColor.b,
              )
            }
            if (s.defaultMacroBackgroundColor && !(s.defaultMacroBackgroundColor instanceof Color)) {
              s.defaultMacroBackgroundColor = new Color(
                s.defaultMacroBackgroundColor.r,
                s.defaultMacroBackgroundColor.g,
                s.defaultMacroBackgroundColor.b,
              )
            }
          })
        }
        return parsed
      }
    } catch (e) {
      console.error('Failed to load state from localStorage', e)
    }
    return { macros: {}, screens: {} }
  }

  const state = loadState()
  const macros = ref<Record<string, MacroData>>(state.macros)
  const screens = ref<Record<string, ScreenData>>(state.screens)

  // Save to localStorage whenever state changes
  function saveState() {
    try {
      const toStore = {
        macros: macros.value,
        screens: screens.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    } catch (e) {
      console.error('Failed to save state to localStorage', e)
    }
  }

  watch(
    [macros, screens],
    () => {
      saveState()
    },
    { deep: true },
  )

  // --- Internal helpers ---
  function _addMacro(macro: MacroData) {
    macros.value[macro.id] = macro
  }

  function _deleteMacro(id: string) {
    const { [id]: _removed, ...rest } = macros.value
    macros.value = rest
  }

  // --- Public macro functions ---
  function getMacro(id: string): MacroData | undefined {
    return macros.value[id]
  }

  function updateMacro(updatedMacro: MacroData, id?: string) {
    const macroId = id || updatedMacro.id
    macros.value[macroId] = updatedMacro
  }

  // Add a macro to the store (without placing it in a screen)
  function addMacroToStore(macro: MacroData) {
    _addMacro(macro)
  }

  // Delete a macro from the store (should also remove from any screens)
  // This function only deletes from store; use clearMacroAt to remove from screen
  function deleteMacroFromStore(id: string) {
    _deleteMacro(id)
  }

  // --- Screen functions ---
  function addScreen(screen: ScreenData, macrosArray?: MacroData[] | MacroData[][]) {
    // If macros are provided, add them to store and associate with screen
    if (Array.isArray(macrosArray) && macrosArray.length > 0) {
      if (Array.isArray(macrosArray[0])) {
        // 2D array
        const macroRows = macrosArray as MacroData[][]
        const rows: ScreenRow[] = []
        for (const row of macroRows) {
          const currentRow: ScreenRow = { macrosIds: [] }
          for (const macro of row) {
            _addMacro(macro)
            currentRow.macrosIds.push(macro.id)
          }
          rows.push(currentRow)
        }
        screen.macroRows = rows
      } else {
        // Flat array – add macros but don't place them (assume they are already placed)
        for (const macro of macrosArray as MacroData[]) {
          _addMacro(macro)
        }
      }
    }

    screens.value[screen.id] = screen
  }

  function getScreen(id: string): ScreenData | undefined {
    return screens.value[id]
  }

  function getScreenList(): ScreenListItem[] {
    return Object.values(screens.value).map((screen) => ({
      id: screen.id,
      name: screen.name,
    }))
  }

  // Deletes the screen and all macros associated with it
  function deleteScreen(screenOrScreenId: string | ScreenData) {
    const id = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    if (!screens.value[id]) {
      console.error(`Screen with id ${id} does not exist`)
      return
    }
    // Delete all macros in this screen
    for (const row of screens.value[id].macroRows) {
      for (const macroId of row.macrosIds) {
        if (macroId) {
          _deleteMacro(macroId)
        }
      }
    }
    const { [id]: _removed, ...rest } = screens.value
    screens.value = rest
  }

  function updateScreen(updatedScreen: ScreenData, id?: string) {
    const screenId = id || updatedScreen.id
    screens.value[screenId] = updatedScreen
  }

  // --- Cell manipulation functions ---
  function setMacroAt(screenId: string, position: Position, macro: MacroData) {
    const screen = screens.value[screenId]
    if (!screen) {
      console.error(`Screen with id ${screenId} does not exist`)
      return
    }
    if (position.row >= screen.size.rows || position.column >= screen.size.columns) {
      console.error(
        `Invalid position (${position.row}, ${position.column}) for screen size ${screen.size.rows}x${screen.size.columns}`,
      )
      return
    }
    // Add macro to store if not already present
    if (!macros.value[macro.id]) {
      _addMacro(macro)
    }
    // Update screen cell
    screen.macroRows[position.row].macrosIds[position.column] = macro.id
  }

  function clearMacroAt(screenId: string, position: Position) {
    const screen = screens.value[screenId]
    if (!screen) return
    if (position.row >= screen.size.rows || position.column >= screen.size.columns) return
    const macroId = screen.macroRows[position.row].macrosIds[position.column]
    if (macroId) {
      // Optionally delete the macro from store? Usually we keep it in case other screens reference it.
      // We'll just clear the cell.
      screen.macroRows[position.row].macrosIds[position.column] = ''
    }
  }

  function getMacroAt(screenId: string, position: Position): MacroData | undefined {
    const screen = screens.value[screenId]
    if (!screen) return undefined
    const macroId = screen.macroRows[position.row]?.macrosIds[position.column]
    if (!macroId) return undefined
    return macros.value[macroId]
  }

  // Legacy function names (for backward compatibility if needed)
  function addMacro(screenOrScreenId: string | ScreenData, macro: MacroData, position: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    setMacroAt(screenId, position, macro)
  }

  function deleteMacro(screenOrScreenId: string | ScreenData, position: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    clearMacroAt(screenId, position)
  }

  function moveMacro(screenOrScreenId: string | ScreenData, from: Position, to: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    const screen = screens.value[screenId]
    if (!screen) return
    const macroId = screen.macroRows[from.row]?.macrosIds[from.column]
    if (!macroId) return
    // Validate target position
    if (to.row >= screen.size.rows || to.column >= screen.size.columns) return
    // Clear source
    screen.macroRows[from.row].macrosIds[from.column] = ''
    // Set target
    screen.macroRows[to.row].macrosIds[to.column] = macroId
  }

  return {
    // State
    macros,
    screens,
    // Macro functions
    getMacro,
    updateMacro,
    addMacroToStore,
    deleteMacroFromStore,
    // Screen functions
    addScreen,
    getScreen,
    getScreenList,
    deleteScreen,
    updateScreen,
    // Cell functions
    setMacroAt,
    clearMacroAt,
    getMacroAt,
    // Legacy functions
    addMacro,
    deleteMacro,
    moveMacro,
  }
})
