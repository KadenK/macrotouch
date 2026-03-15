import { defineStore } from 'pinia'
import type { Macro, MacroScreen, Position, ScreenListItem, ScreenRow } from '~/../types'

export const useMacroStore = defineStore('Macro', () => {
  const macros = ref<Record<string, Macro>>({})
  const screens = ref<Record<string, MacroScreen>>({})

  const isApplyingRemoteState = ref(false)
  const isReady = ref(false)
  const broadcastFn = ref<
    ((state: { macros: Record<string, Macro>; screens: Record<string, MacroScreen> }) => void) | null
  >(null)

  function setBroadcastFn(
    fn: (state: { macros: Record<string, Macro>; screens: Record<string, MacroScreen> }) => void,
  ) {
    broadcastFn.value = fn
  }

  function setState(state: { macros: Record<string, Macro>; screens: Record<string, MacroScreen> }) {
    isApplyingRemoteState.value = true
    macros.value = state.macros || {}
    screens.value = state.screens || {}
    isApplyingRemoteState.value = false
    isReady.value = true
  }

  function maybeBroadcast() {
    if (isApplyingRemoteState.value || !isReady.value) return
    broadcastFn.value?.({ macros: macros.value, screens: screens.value })
  }

  function getMacro(id: string): Macro | undefined {
    return macros.value[id]
  }

  function updateMacro(updatedMacro: Macro, id?: string) {
    const macroId = id || updatedMacro.id
    macros.value[macroId] = updatedMacro
    maybeBroadcast()
  }

  function _addMacro(macro: Macro) {
    macros.value[macro.id] = macro
  }

  function _deleteMacro(id: string) {
    const { [id]: _removedMacro, ...remainingMacros } = macros.value
    macros.value = remainingMacros
  }

  // It is normally expected that when adding a screen, it is done without macros, and then macros are added separately.
  // If macroIds are contained within the screen, they must be already added to the store.
  // If an array of macros is provided, they will be added to the store with the assumption that the ids match those in the screen.
  // If a 2D array of macros is provided, they will be added to the store and associated with the screen in the same order.
  function addScreen(screen: MacroScreen, macroArrayOrRows?: Macro[] | Macro[][]) {
    // If macroRows are provided
    if (Array.isArray(macroArrayOrRows) && macroArrayOrRows.length > 0 && Array.isArray(macroArrayOrRows[0])) {
      const macroRows = macroArrayOrRows as Macro[][]
      const rows: ScreenRow[] = []
      for (const row of macroRows) {
        const currentRow: ScreenRow = { macrosIds: [] }
        for (const macro of row) {
          _addMacro(macro) // Add to store
          currentRow.macrosIds.push(macro.id) // Add to row
        }
        rows.push(currentRow) // Add to screen
      }
      screen.macroRows = rows
    } else if (Array.isArray(macroArrayOrRows) && macroArrayOrRows.length > 0) {
      // Else if a flat array of macros is provided
      // Add to store and screen with assumption that ids match those in the screen
      for (const macro of macroArrayOrRows as Macro[]) {
        _addMacro(macro)
      }
    }

    screens.value[screen.id] = screen
    maybeBroadcast()
  }

  function getScreen(id: string): MacroScreen | undefined {
    return screens.value[id]
  }

  function getScreenList(): ScreenListItem[] {
    return Object.values(screens.value).map((screen) => ({
      id: screen.id,
      name: screen.name,
    }))
  }

  // Deletes the screen and all macros associated with it.
  function deleteScreen(screenOrScreenId: string | MacroScreen) {
    const id = resolveScreenId(screenOrScreenId)
    if (!screens.value[id]) {
      console.error(`Screen with id ${id} does not exist`)
      return
    }
    for (const row of screens.value[id].macroRows) {
      for (const macroId of row.macrosIds) {
        _deleteMacro(macroId)
      }
    }
    const { [id]: _removedScreen, ...remainingScreens } = screens.value
    screens.value = remainingScreens
    maybeBroadcast()
  }

  function updateScreen(updatedScreen: MacroScreen, id?: string) {
    const screenId = id || updatedScreen.id
    screens.value[screenId] = updatedScreen
    maybeBroadcast()
  }

  function addMacro(screenOrScreenId: string | MacroScreen, macro: Macro, position: Position) {
    const screenId = resolveScreenId(screenOrScreenId)
    const screen = screens.value[screenId]
    if (!screen) {
      console.error(`Screen with id ${screenId} does not exist`)
      return
    }
    if (position.row >= screen.size.rows || position.column >= screen.size.columns) {
      console.error(`Invalid row or column index for screen size`)
      return
    }
    _addMacro(macro)
    screen.macroRows[position.row]!.macrosIds[position.column] = macro.id
    maybeBroadcast()
  }

  function deleteMacro(screenOrScreenId: string | MacroScreen, position: Position) {
    const screenId = resolveScreenId(screenOrScreenId)
    const screen = screens.value[screenId]
    if (!screen) {
      console.error(`Screen with id ${screenId} does not exist`)
      return
    }
    if (position.row >= screen.size.rows || position.column >= screen.size.columns) {
      console.error(`Invalid row or column index for screen size`)
      return
    }
    const macroId = screen.macroRows[position.row]!.macrosIds[position.column]
    if (macroId) {
      _deleteMacro(macroId)
      screen.macroRows[position.row]!.macrosIds[position.column] = ''
      maybeBroadcast()
    }
  }

  function moveMacro(screenOrScreenId: string | MacroScreen, from: Position, to: Position) {
    const screenId = resolveScreenId(screenOrScreenId)
    const screen = screens.value[screenId]
    if (!screen) {
      console.error(`Screen with id ${screenId} does not exist`)
      return
    }
    if (
      from.row >= screen.size.rows ||
      from.column >= screen.size.columns ||
      to.row >= screen.size.rows ||
      to.column >= screen.size.columns
    ) {
      console.error(`Invalid row or column index for screen size`)
      return
    }
    const macroId = screen.macroRows[from.row]!.macrosIds[from.column]
    if (macroId) {
      _deleteMacro(macroId)
      screen.macroRows[to.row]!.macrosIds[to.column] = macroId
      maybeBroadcast()
    }
  }

  return {
    macros,
    screens,
    getMacro,
    updateMacro,
    addScreen,
    getScreen,
    getScreenList,
    deleteScreen,
    updateScreen,
    addMacro,
    deleteMacro,
    moveMacro,
    setState,
    setBroadcastFn,
  }
})

function resolveScreenId(screenOrScreenId: string | MacroScreen): string {
  return typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
}
