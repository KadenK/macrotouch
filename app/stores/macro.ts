import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Action,
  BroadcastData,
  Color,
  Macro,
  MacroScreen,
  MacroSettings,
  MacroState,
  Position,
  ScreenListItem,
  ScreenRow,
} from '~/../types'
import { createMacroScreen, createColor } from '~/../types'
import { actions as actionList } from '~/../util/actions'

const DEFAULT_SETTINGS: MacroSettings = {
  defaultScreenBgColor: createColor(240, 240, 240),
  defaultScreenSize: { rows: 3, columns: 5 },
  swipeToChangeScreens: true,
  attemptFullscreen: true,
}

export const useMacroStore = defineStore('Macro', () => {
  const macros = ref<Record<string, Macro>>({})
  const screens = ref<Record<string, MacroScreen>>({})
  const settings = ref<MacroSettings>({
    ...DEFAULT_SETTINGS,
    defaultScreenSize: { ...DEFAULT_SETTINGS.defaultScreenSize },
  })

  const isApplyingRemoteState = ref(false)
  const isReady = ref(false)

  const actions = ref<Action[]>(actionList)

  const broadcastFn = ref<((data: BroadcastData) => void) | null>(null)

  function setBroadcastFn(fn: (data: BroadcastData) => void) {
    broadcastFn.value = fn
  }

  function setState(state: MacroState) {
    isApplyingRemoteState.value = true

    macros.value = state.macros || {}
    screens.value = {}

    if (state.settings) {
      settings.value = {
        defaultScreenBgColor: state.settings.defaultScreenBgColor ?? { ...DEFAULT_SETTINGS.defaultScreenBgColor },
        defaultScreenSize: state.settings.defaultScreenSize ?? { ...DEFAULT_SETTINGS.defaultScreenSize },
        swipeToChangeScreens: state.settings.swipeToChangeScreens ?? DEFAULT_SETTINGS.swipeToChangeScreens,
        attemptFullscreen: state.settings.attemptFullscreen ?? DEFAULT_SETTINGS.attemptFullscreen,
      }
    }

    if (state.screens) {
      for (const [id, rawScreen] of Object.entries(state.screens)) {
        const backgroundColor: Color = rawScreen?.backgroundColor ?? createColor(240, 240, 240)
        const defaultMacroIconColor: Color | undefined = rawScreen?.defaultMacroIconColor
        const defaultMacroBackgroundColor: Color | undefined = rawScreen?.defaultMacroBackgroundColor

        const screen = createMacroScreen(
          rawScreen?.name ?? 'Untitled',
          rawScreen?.size ?? { rows: 3, columns: 4 },
          backgroundColor,
          defaultMacroIconColor,
          defaultMacroBackgroundColor,
          rawScreen?.id,
        )

        if (Array.isArray(rawScreen?.macroRows)) {
          screen.macroRows = rawScreen.macroRows.map((row) => ({
            macrosIds: Array.isArray(row?.macrosIds)
              ? row.macrosIds.slice(0, screen.size.columns)
              : Array(screen.size.columns).fill(''),
          }))
          while (screen.macroRows.length < screen.size.rows) {
            screen.macroRows.push({ macrosIds: Array(screen.size.columns).fill('') })
          }
        }

        screens.value[id] = screen
      }
    }

    isApplyingRemoteState.value = false
    isReady.value = true
  }

  function maybeBroadcast() {
    if (isApplyingRemoteState.value || !isReady.value) return
    broadcastFn.value?.({ macros: macros.value, screens: screens.value, settings: settings.value })
  }

  function updateSettings(updated: Partial<MacroSettings>) {
    settings.value = { ...settings.value, ...updated }
    maybeBroadcast()
  }

  function getMacro(id: string): Macro | undefined {
    return macros.value[id]
  }

  function updateMacro(updatedMacro: Macro, id?: string) {
    const macroId = id || updatedMacro.id
    macros.value[macroId] = updatedMacro
    maybeBroadcast()
  }

  function triggerMacro(macroId: string) {
    if (!macros.value[macroId]) {
      console.warn(`Macro with id ${macroId} does not exist`)
    }
    broadcastFn.value?.({ type: 'macro-trigger', id: macroId })
  }

  function _addMacro(macro: Macro) {
    macros.value[macro.id] = macro
  }

  function _deleteMacro(id: string) {
    const { [id]: _removedMacro, ...remainingMacros } = macros.value
    macros.value = remainingMacros
  }

  function addScreen(screen: MacroScreen, macroArrayOrRows?: Macro[] | Macro[][]) {
    if (Array.isArray(macroArrayOrRows) && macroArrayOrRows.length > 0 && Array.isArray(macroArrayOrRows[0])) {
      const macroRows = macroArrayOrRows as Macro[][]
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
    } else if (Array.isArray(macroArrayOrRows) && macroArrayOrRows.length > 0) {
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
      screen.macroRows[from.row]!.macrosIds[from.column] = ''
      screen.macroRows[to.row]!.macrosIds[to.column] = macroId
      maybeBroadcast()
    }
  }

  return {
    macros,
    screens,
    settings,
    actions,
    isReady,
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
    triggerMacro,
    setState,
    setBroadcastFn,
    updateSettings,
  }
})

function resolveScreenId(screenOrScreenId: string | MacroScreen): string {
  return typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
}