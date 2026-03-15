/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { defineStore } from 'pinia'
import type { MacroData, ScreenData, Position, ScreenListItem } from '~/../types'
import { Color } from '~/../types/common'
import { useWebSocket } from '~/composables/useWebSocket'

// Helper to reconstruct Color objects from plain JSON
function hydrateColor(obj: any): Color {
  return new Color(obj.r, obj.g, obj.b)
}

function hydrateState(data: any): { macros: Record<string, MacroData>; screens: Record<string, ScreenData> } {
  const macros: Record<string, MacroData> = {}
  const screens: Record<string, ScreenData> = {}

  if (data.macros) {
    Object.entries(data.macros).forEach(([id, m]: [string, any]) => {
      try {
        macros[id] = {
          ...m,
          iconColor: hydrateColor(m.iconColor),
          backgroundColor: hydrateColor(m.backgroundColor),
        }
      } catch (e) {
        console.error(`Failed to hydrate macro ${id}:`, e, m)
      }
    })
  }

  if (data.screens) {
    Object.entries(data.screens).forEach(([id, s]: [string, any]) => {
      try {
        screens[id] = {
          ...s,
          backgroundColor: hydrateColor(s.backgroundColor),
          defaultMacroIconColor: s.defaultMacroIconColor ? hydrateColor(s.defaultMacroIconColor) : undefined,
          defaultMacroBackgroundColor: s.defaultMacroBackgroundColor
            ? hydrateColor(s.defaultMacroBackgroundColor)
            : undefined,
        }
      } catch (e) {
        console.error(`Failed to hydrate screen ${id}:`, e, s)
      }
    })
  }

  return { macros, screens }
}

export const useMacroStore = defineStore('Macro', () => {
  const macros = ref<Record<string, MacroData>>({})
  const screens = ref<Record<string, ScreenData>>({})
  const isInitialized = ref(false)

  const { send, onMessage } = useWebSocket()

  // --- WebSocket listeners ---
  onMessage((data: any) => {
    switch (data.type) {
      case 'macro-updated':
        macros.value[data.payload.id] = data.payload
        break
      case 'macro-deleted':
        delete macros.value[data.payload.id]
        break
      case 'screen-updated':
        screens.value[data.payload.id] = data.payload
        break
      case 'screen-deleted':
        delete screens.value[data.payload.id]
        break
      case 'cell-updated':
        const { screenId, row, column, macroId } = data.payload
        if (screens.value[screenId]) {
          screens.value[screenId].macroRows[row].macrosIds[column] = macroId
        }
        break
    }
  })

  let initPromise: Promise<void> | null = null
  // --- Initialisation ---
  async function init() {
    // If a fetch is already in progress, wait for it
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const data = await $fetch('/api/state')
        const hydrated = hydrateState(data)
        // Always replace local state with server state
        macros.value = hydrated.macros
        screens.value = hydrated.screens
        console.log('Store initialized with server data:', {
          macros: Object.keys(macros.value).length,
          screens: Object.keys(screens.value).length,
        })
      } catch (e) {
        console.error('Failed to load state from server', e)
        // Keep existing local state if server fails
      } finally {
        initPromise = null
      }
    })()

    return initPromise
  }

  // --- Internal helpers ---
  function _addMacro(macro: MacroData) {
    macros.value[macro.id] = macro
  }

  function _deleteMacro(id: string) {
    delete macros.value[id]
  }

  // --- Public macro functions ---
  function getMacro(id: string) {
    return macros.value[id]
  }

  async function updateMacro(updatedMacro: MacroData, id?: string) {
    const macroId = id || updatedMacro.id
    macros.value[macroId] = updatedMacro
    try {
      await $fetch('/api/macro', { method: 'POST', body: updatedMacro })
    } catch (e) {
      console.error('Failed to update macro', e)
    }
  }

  function addMacroToStore(macro: MacroData) {
    _addMacro(macro)
  }

  async function deleteMacroFromStore(id: string) {
    delete macros.value[id]
    try {
      await $fetch(`/api/macro/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete macro', e)
    }
  }

  // --- Screen functions ---
  async function addScreen(screen: ScreenData, macrosArray?: MacroData[] | MacroData[][]) {
    if (Array.isArray(macrosArray) && macrosArray.length > 0) {
      if (Array.isArray(macrosArray[0])) {
        const macroRows = macrosArray as MacroData[][]
        const rows: { macrosIds: string[] }[] = []
        for (const row of macroRows) {
          const currentRow: { macrosIds: string[] } = { macrosIds: [] }
          for (const macro of row) {
            _addMacro(macro)
            currentRow.macrosIds.push(macro.id)
          }
          rows.push(currentRow)
        }
        screen.macroRows = rows
      } else {
        for (const macro of macrosArray as MacroData[]) {
          _addMacro(macro)
        }
      }
    }

    screens.value[screen.id] = screen
    try {
      await $fetch('/api/screen', { method: 'POST', body: screen })
    } catch (e) {
      console.error('Failed to save screen', e)
    }
  }

  function getScreen(id: string) {
    return screens.value?.[id]
  }

  function getScreenList(): ScreenListItem[] {
    return screens.value ? Object.values(screens.value).map((s) => ({ id: s.id, name: s.name })) : []
  }

  async function deleteScreen(screenOrScreenId: string | ScreenData) {
    const id = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    const screen = screens.value[id]
    if (!screen) return

    // Optimistically remove screen and its macros from local store
    // (server will broadcast deletions, but we can also update locally now)
    for (const row of screen.macroRows) {
      for (const macroId of row.macrosIds) {
        if (macroId) {
          delete macros.value[macroId]
        }
      }
    }
    delete screens.value[id]

    try {
      await $fetch(`/api/screen/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete screen', e)
      // Optionally revert optimistic update
    }
  }

  async function updateScreen(updatedScreen: ScreenData, id?: string) {
    const screenId = id || updatedScreen.id
    screens.value[screenId] = updatedScreen
    try {
      await $fetch('/api/screen', { method: 'POST', body: updatedScreen })
    } catch (e) {
      console.error('Failed to update screen', e)
    }
  }

  // --- Cell functions ---
  async function setMacroAt(screenId: string, position: Position, macro: MacroData) {
    const screen = screens.value[screenId]
    if (!screen) return
    if (position.row >= screen.size.rows || position.column >= screen.size.columns) return

    // 1. Save macro data to server first (if it's new or updated)
    try {
      await $fetch('/api/macro', { method: 'POST', body: macro })
    } catch (e) {
      console.error('Failed to save macro data', e)
      return // stop if macro save fails
    }

    // 2. Add to local store if not already present
    if (!macros.value[macro.id]) {
      _addMacro(macro)
    }

    // 3. Update local cell
    screen.macroRows[position.row].macrosIds[position.column] = macro.id

    // 4. Update cell on server
    try {
      await $fetch(`/api/screen/${screenId}/cell`, {
        method: 'POST',
        body: { row: position.row, column: position.column, macroId: macro.id },
      })
    } catch (e) {
      console.error('Failed to set cell', e)
    }
  }

  async function clearMacroAt(macroId: string, screenId: string, position: Position) {
    // 1. Clear the cell where it resides (optional, but ensures no orphaned reference)
    const screen = screens.value[screenId]
    if (screen && position.row < screen.size.rows && position.column < screen.size.columns) {
      screen.macroRows[position.row].macrosIds[position.column] = ''
      // Notify server about cell update
      try {
        await $fetch(`/api/screen/${screenId}/cell`, {
          method: 'POST',
          body: { row: position.row, column: position.column, macroId: null },
        })
      } catch (e) {
        console.error('Failed to clear cell', e)
      }
    }

    // 2. Delete macro from server
    try {
      await $fetch(`/api/macro/${macroId}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete macro from server', e)
      return
    }

    // 3. Delete macro from local store
    delete macros.value[macroId]
  }

  function getMacroAt(screenId: string, position: Position): MacroData | undefined {
    const screen = screens.value[screenId]
    if (!screen) return undefined
    const macroId = screen.macroRows[position.row]?.macrosIds[position.column]
    return macroId ? macros.value[macroId] : undefined
  }

  // Legacy function names
  async function addMacro(screenOrScreenId: string | ScreenData, macro: MacroData, position: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    await setMacroAt(screenId, position, macro)
  }

  async function deleteMacro(screenOrScreenId: string | ScreenData, position: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    await clearMacroAt(screenId, position)
  }

  async function moveMacro(screenOrScreenId: string | ScreenData, from: Position, to: Position) {
    const screenId = typeof screenOrScreenId === 'string' ? screenOrScreenId : screenOrScreenId.id
    const screen = screens.value[screenId]
    if (!screen) return
    const macroId = screen.macroRows[from.row]?.macrosIds[from.column]
    if (!macroId) return

    screen.macroRows[from.row].macrosIds[from.column] = ''
    screen.macroRows[to.row].macrosIds[to.column] = macroId

    try {
      await $fetch(`/api/screen/${screenId}/cell`, {
        method: 'POST',
        body: { row: from.row, column: from.column, macroId: null },
      })
      await $fetch(`/api/screen/${screenId}/cell`, {
        method: 'POST',
        body: { row: to.row, column: to.column, macroId },
      })
    } catch (e) {
      console.error('Failed to move macro', e)
    }
  }

  return {
    macros,
    screens,
    isInitialized,
    init,
    getMacro,
    updateMacro,
    addMacroToStore,
    deleteMacroFromStore,
    addScreen,
    getScreen,
    getScreenList,
    deleteScreen,
    updateScreen,
    setMacroAt,
    clearMacroAt,
    getMacroAt,
    addMacro,
    deleteMacro,
    moveMacro,
  }
})
