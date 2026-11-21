import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ActionCatalog,
  ActionGroup,
  ActionStateEntry,
  ActionStateKey,
  ActionStateValue,
  ActionOption,
  InstalledPlugin,
  NodeInfo,
  PluginFiles,
  Color,
  Macro,
  MacroScreen,
  MacroSettings,
  MacroSpan,
  MacroState,
  Position,
  ScreenListItem,
  ScreenRow,
} from '~/../shared/types'
import type { ActionResult, ClientToMasterMessage, PluginTestResult, StatePatch } from '~/../shared/protocol'
import { uuid } from '~/../shared/uuid'
import { applyAssignments, fits, isUnitSpan, planMove, resolveLayout } from '~/../shared/layout'
import { actionStateKey, createMacroScreen, createColor, createDefaultSettings, nodeLabel } from '~/../shared/types'

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
  const actionError = ref<{ message: string } | null>(null)

  function reportActionError(message: string) {
    actionError.value = { message }
  }

  /** One catalog per connected action server, from the master. */
  const catalogs = ref<Record<string, ActionCatalog>>({})
  const nodes = ref<NodeInfo[]>([])
  const plugins = ref<Record<string, InstalledPlugin>>({})
  const localNode = computed(() => nodes.value.find((node) => node.local))

  /** The groups (one per plugin) this computer's action server offers. */
  const actionGroups = computed<ActionGroup[]>(
    () => (localNode.value && catalogs.value[localNode.value.nodeId]?.groups) || [],
  )
  /** `"<computer>: "` to start a per-computer message with, or nothing when there is only one computer. */
  function nodePrefix(node: NodeInfo): string {
    return nodes.value.length > 1 ? `${nodeLabel(node)}: ` : ''
  }
  /** One plugin's group as a given action server reports it, if it runs there. */
  function pluginGroup(nodeId: string, pluginId: string): ActionGroup | undefined {
    return catalogs.value[nodeId]?.groups.find((group) => group.id === pluginId)
  }

  function applyCatalogs(updated: Record<string, ActionCatalog>, updatedNodes: NodeInfo[]) {
    catalogs.value = updated
    nodes.value = updatedNodes
  }

  /** Latest live readings of stateful actions, from the master. Controllers only. */
  const actionStates = ref<Record<ActionStateKey, ActionStateEntry>>({})

  function applyActionState(states: ActionStateEntry[]) {
    for (const entry of states) actionStates.value[entry.key] = entry
  }

  /** The live reading for a macro's action, if it has one. */
  function getActionState(macro: Macro): ActionStateEntry | undefined {
    if (!macro.actionId) return undefined
    return actionStates.value[actionStateKey(macro.actionId, macro.parameters, macro.nodeId)]
  }

  /**
   * The screen this controller is showing. The master watches the stateful
   * actions on it, so it is re-sent after every snapshot: a reconnect wipes
   * the master's record.
   */
  const viewedScreenId = ref<string | null>(null)

  function setViewedScreen(screenId: string | null) {
    if (viewedScreenId.value === screenId) return
    viewedScreenId.value = screenId
    if (isReady.value) sendFn.value?.({ type: 'view-screen', screenId })
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

  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()

  function request(message: ClientToMasterMessage & { requestId: string }): Promise<unknown> {
    if (!isReady.value || !sendFn.value) return Promise.reject(new Error('Not connected'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(message.requestId)
        reject(new Error('Request timed out'))
      }, 30000)
      pending.set(message.requestId, { resolve, reject, timer })
      sendFn.value!(message)
    })
  }

  function applyActionResult(result: ActionResult): boolean {
    const entry = pending.get(result.requestId)
    if (!entry) return false
    pending.delete(result.requestId)
    clearTimeout(entry.timer)
    if (result.ok) entry.resolve(result.value)
    else entry.reject(new Error(result.error.message))
    return true
  }

  function installPlugin(files: PluginFiles) {
    return request({ type: 'install-plugin', requestId: uuid(), files })
  }
  function updatePlugin(pluginId: string, patch: { enabled?: boolean; settings?: Record<string, unknown> }) {
    send({ type: 'update-plugin', pluginId, ...patch })
  }
  function deletePlugin(pluginId: string) {
    send({ type: 'delete-plugin', pluginId })
  }
  function setPluginSecrets(pluginId: string, nodeId: string, values: Record<string, string | null>) {
    send({ type: 'plugin-secrets', pluginId, nodeId, values })
  }
  /** Run a plugin's connection test on one action server. */
  async function testPlugin(nodeId: string, pluginId: string): Promise<PluginTestResult> {
    return (await request({ type: 'test-plugin', requestId: uuid(), nodeId, pluginId })) as PluginTestResult
  }
  async function listOptions(
    nodeId: string | undefined,
    actionId: string,
    field: string,
    parameters: Record<string, unknown>,
  ): Promise<ActionOption[]> {
    return (await request({
      type: 'list-options',
      requestId: uuid(),
      nodeId,
      actionId,
      field,
      parameters,
    })) as ActionOption[]
  }

  function applySnapshot(
    state: MacroState,
    snapshotCatalogs?: Record<string, ActionCatalog>,
    snapshotActionState?: Record<ActionStateKey, ActionStateEntry>,
    snapshotNodes?: NodeInfo[],
  ) {
    isApplyingRemoteState.value = true

    catalogs.value = snapshotCatalogs ?? {}
    nodes.value = snapshotNodes ?? []
    plugins.value = state.plugins ?? {}
    actionStates.value = snapshotActionState ? { ...snapshotActionState } : {}

    macros.value = state.macros || {}
    screens.value = {}

    if (state.settings) {
      settings.value = {
        defaultScreenBgColor: state.settings.defaultScreenBgColor ?? { ...DEFAULT_SETTINGS.defaultScreenBgColor },
        defaultScreenSize: state.settings.defaultScreenSize ?? { ...DEFAULT_SETTINGS.defaultScreenSize },
        defaultMacroIconColor: state.settings.defaultMacroIconColor ?? { ...DEFAULT_SETTINGS.defaultMacroIconColor },
        defaultMacroBackgroundColor: state.settings.defaultMacroBackgroundColor ?? {
          ...DEFAULT_SETTINGS.defaultMacroBackgroundColor,
        },
        swipeToChangeScreens: state.settings.swipeToChangeScreens ?? DEFAULT_SETTINGS.swipeToChangeScreens,
        hideBlankButtons: state.settings.hideBlankButtons ?? DEFAULT_SETTINGS.hideBlankButtons,
        attemptFullscreen: state.settings.attemptFullscreen ?? DEFAULT_SETTINGS.attemptFullscreen,
        showEditorLabels: state.settings.showEditorLabels ?? DEFAULT_SETTINGS.showEditorLabels,
        showRemoteLabels: state.settings.showRemoteLabels ?? DEFAULT_SETTINGS.showRemoteLabels,
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
    if (viewedScreenId.value) sendFn.value?.({ type: 'view-screen', screenId: viewedScreenId.value })
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

    if (patch.plugins) {
      for (const [id, plugin] of Object.entries(patch.plugins)) {
        if (plugin === null) {
          const { [id]: _removed, ...rest } = plugins.value
          plugins.value = rest
        } else plugins.value[id] = plugin
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
    // The size belongs to the layout, not the editor that rebuilt this macro.
    const span = macros.value[macroId]?.span
    macros.value[macroId] = span ? { ...updatedMacro, span } : updatedMacro
    send({ type: 'upsert-macro', macro: macros.value[macroId]! })
  }

  /** Run a macro. `value` is for faces that set one, such as a plugin's dial. */
  function triggerMacro(macroId: string, value?: ActionStateValue) {
    if (!macros.value[macroId]) {
      console.warn(`Macro with id ${macroId} does not exist`)
    }
    sendFn.value?.({ type: 'macro-trigger', requestId: uuid(), macroId, ...(value === undefined ? {} : { value }) })
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
    const covering = resolveLayout(screen, macros.value).owner[position.row]![position.column]
    if (covering && covering !== macro.id) {
      console.error(`Cell ${position.row},${position.column} is taken`)
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
    // Moves onto free cells, or swaps with the one macro in the way; otherwise nothing changes.
    const plan = planMove(screen, macros.value, from, to)
    if (!plan) return
    applyAssignments(screen, plan)
    send({ type: 'move-macro', screenId, from, to })
  }

  /** Make the macro whose top-left cell is `position` cover `span` cells. Does nothing if that doesn't fit. */
  function resizeMacro(
    screenOrScreenId: string | MacroScreen,
    position: Position,
    span: MacroSpan,
    anchor: Position = position,
  ) {
    const screenId = resolveScreenId(screenOrScreenId)
    const screen = screens.value[screenId]
    if (!screen) {
      console.error(`Screen with id ${screenId} does not exist`)
      return
    }
    const placed = resolveLayout(screen, macros.value).placements.find(
      (p) => p.row === position.row && p.column === position.column,
    )
    const macro = placed && macros.value[placed.macroId]
    if (!placed || !macro || !fits(screen, macros.value, placed.macroId, anchor, span)) return

    const { span: _old, ...rest } = macro
    macros.value[placed.macroId] = isUnitSpan(span) ? rest : { ...rest, span: { ...span } }
    if (anchor.row !== position.row || anchor.column !== position.column) {
      applyAssignments(screen, [{ macroId: placed.macroId, from: position, to: anchor }])
      send({ type: 'resize-macro', screenId, position, span, anchor })
    } else {
      send({ type: 'resize-macro', screenId, position, span })
    }
  }

  return {
    macros,
    screens,
    settings,
    actionGroups,
    pluginGroup,
    nodePrefix,
    catalogs,
    nodes,
    localNode,
    plugins,
    installPlugin,
    updatePlugin,
    deletePlugin,
    setPluginSecrets,
    listOptions,
    testPlugin,
    applyActionResult,
    actionError,
    reportActionError,
    actionStates,
    isReady,
    getActionState,
    applyActionState,
    setViewedScreen,
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
    resizeMacro,
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
