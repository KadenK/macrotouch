import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ActionCatalog,
  ActionDescriptor,
  Color,
  Macro,
  MacroScreen,
  MacroSettings,
  MacroState,
  Position,
  ScreenListItem,
  ScreenRow,
} from '~/../shared/types'
import type { ClientToMasterMessage, StatePatch } from '~/../shared/protocol'
import { uuid } from '~/../shared/uuid'
import { createMacroScreen, createColor, createDefaultSettings } from '~/../shared/types'

const DEFAULT_SETTINGS: MacroSettings = createDefaultSettings()

export const useMacroStore = defineStore('Macro', () => {
  const macros = ref<Record<string, Macro>>({})
  const screens = ref<Record<string, MacroScreen>>({})
  const settings = ref<MacroSettings>({
    ...DEFAULT_SETTINGS,
    defaultScreenSize: { ...DEFAULT_SETTINGS.defaultScreenSize },
  })

  const isApplyingRemoteState = ref(false)
  const isReady = ref(false)

  /** One catalog per connected action server, from the master. */
  const catalogs = ref<Record<string, ActionCatalog>>({})

  // Macros have no node yet, so the first node's actions are the ones offered.
  const actions = computed<ActionDescriptor[]>(() => {
    const catalog = Object.values(catalogs.value)[0]
    return catalog ? catalog.groups.flatMap((group) => group.actions) : []
  })

  function applyCatalogs(updated: Record<string, ActionCatalog>) {
    catalogs.value = updated
  }

  const sendFn = ref<((message: ClientToMasterMessage) => void) | null>(null)

  function setSendFn(fn: (message: ClientToMasterMessage) => void) {
    sendFn.value = fn
  }

  /** Send a command to the master. Never called while applying a remote change. */
  function send(message: ClientToMasterMessage) {
    if (isApplyingRemoteState.value || !isReady.value) return
    sendFn.value?.(message)
  }

  function applySnapshot(state: MacroState, snapshotCatalogs?: Record<string, ActionCatalog>) {
    isApplyingRemoteState.value = true

    catalogs.value = snapshotCatalogs ?? {}

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
    // Ready on snapshot, not on socket open: a command sent before the
    // handshake completes would be clobbered by the snapshot that follows.
    isReady.value = true
  }

  /**
   * Apply a master-authored delta. Mutates only - never sends, or a patch
   * would echo straight back as a new command.
   */
  function applyPatch(patch: StatePatch) {
    isApplyingRemoteState.value = true

    if (patch.macros) {
      for (const [id, macro] of Object.entries(patch.macros)) {
        if (macro === null) {
          const { [id]: _removed, ...rest } = macros.value
          macros.value = rest
        } else {
          macros.value[id] = macro
        }
      }
    }

    if (patch.screens) {
      for (const [id, screen] of Object.entries(patch.screens)) {
        if (screen === null) {
          const { [id]: _removed, ...rest } = screens.value
          screens.value = rest
        } else {
          screens.value[id] = screen
        }
      }
    }

    if (patch.settings) {
      settings.value = { ...settings.value, ...patch.settings }
    }

    isApplyingRemoteState.value = false
  }

  function updateSettings(updated: Partial<MacroSettings>) {
    settings.value = { ...settings.value, ...updated }
    send({ type: 'update-settings', settings: updated })
  }

  function getMacro(id: string): Macro | undefined {
    return macros.value[id]
  }

  function updateMacro(updatedMacro: Macro, id?: string) {
    const macroId = id || updatedMacro.id
    macros.value[macroId] = updatedMacro
    send({ type: 'upsert-macro', macro: macros.value[macroId]! })
  }

  function triggerMacro(macroId: string) {
    if (!macros.value[macroId]) {
      console.warn(`Macro with id ${macroId} does not exist`)
    }
    sendFn.value?.({ type: 'macro-trigger', requestId: uuid(), macroId })
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
    // Macros created alongside the screen are upserted first so the master
    // never holds a screen referencing a macro it hasn't seen.
    for (const macroId of new Set(screen.macroRows.flatMap((row) => row.macrosIds).filter(Boolean))) {
      const macro = macros.value[macroId]
      if (macro) send({ type: 'upsert-macro', macro })
    }
    send({ type: 'upsert-screen', screen })
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
    send({ type: 'delete-screen', screenId: id })
  }

  function updateScreen(updatedScreen: MacroScreen, id?: string) {
    const screenId = id || updatedScreen.id
    screens.value[screenId] = updatedScreen
    send({ type: 'upsert-screen', screen: screens.value[screenId]! })
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
    send({ type: 'upsert-macro', macro, placement: { screenId, position } })
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
      send({ type: 'delete-macro', screenId, position })
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
      send({ type: 'move-macro', screenId, from, to })
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
    applySnapshot,
    applyPatch,
    applyCatalogs,
    setSendFn,
    updateSettings,
  }
})

function resolveScreenId(screenOrScreenId: string | MacroScreen): string {
  return typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
}
