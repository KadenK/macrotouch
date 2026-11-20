import type { InstalledPlugin, Macro, MacroScreen, MacroState, ScreenRow } from '../shared/types'
import { applyAssignments, fits, isUnitSpan, planMove, resolveLayout } from '../shared/layout'
import type { ProtocolError, StateCommand, StatePatch } from '../shared/protocol'
import { emptyState } from './state-file'

/**
 * Owns the state and applies commands to it.
 *
 * A command either produces a {@link StatePatch} describing exactly what
 * changed, or a {@link ProtocolError} naming what was wrong with it. Nothing
 * here throws on bad input.
 */

const err = (code: ProtocolError['code'], message: string, details?: unknown): ProtocolError => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
})

const isError = (v: unknown): v is ProtocolError => typeof v === 'object' && v !== null && 'code' in v && 'message' in v

export { isError as isProtocolError }

/**
 * Clamp a screen's rows to its declared size.
 *
 * This used to run on the client, on every full-state receive
 * (`stores/macro.ts`). Under `state-patch` the client applies entities
 * directly, so it has to happen here or shrinking a grid stops dropping
 * out-of-range placements (SC-06). Matches the old client logic exactly:
 * columns are sliced, rows are padded but never truncated.
 */
function normalizeScreen(screen: MacroScreen): MacroScreen {
  const rows: ScreenRow[] = Array.isArray(screen.macroRows)
    ? screen.macroRows.map((row) => ({
        macrosIds: Array.isArray(row?.macrosIds)
          ? row.macrosIds.slice(0, screen.size.columns)
          : Array(screen.size.columns).fill(''),
      }))
    : []

  while (rows.length < screen.size.rows) {
    rows.push({ macrosIds: Array(screen.size.columns).fill('') })
  }

  return { ...screen, macroRows: rows }
}

export class StateStore {
  private state: MacroState

  constructor(initial: MacroState = emptyState()) {
    this.state = initial
  }

  getState(): MacroState {
    return this.state
  }

  applyCommand(cmd: StateCommand): StatePatch | ProtocolError {
    switch (cmd.type) {
      case 'update-plugin': {
        const plugin =
          this.state.plugins && Object.hasOwn(this.state.plugins, cmd.pluginId)
            ? this.state.plugins[cmd.pluginId]
            : undefined
        if (!plugin) return err('unknown-plugin', `No plugin ${cmd.pluginId}`)
        if (plugin.settingFields?.some((field) => field.secret && Object.hasOwn(cmd.settings ?? {}, field.key)))
          return err('invalid-message', 'Secret settings cannot be stored')
        return this.upsertPlugin({
          ...plugin,
          enabled: cmd.enabled ?? plugin.enabled,
          settings: { ...plugin.settings, ...cmd.settings },
        })
      }
      case 'delete-plugin': {
        if (!this.state.plugins || !Object.hasOwn(this.state.plugins, cmd.pluginId))
          return err('unknown-plugin', `No plugin ${cmd.pluginId}`)
        const { [cmd.pluginId]: _removed, ...remaining } = this.state.plugins
        this.state.plugins = remaining
        return { type: 'state-patch', plugins: { [cmd.pluginId]: null } }
      }
      case 'upsert-macro':
        return this.upsertMacro(cmd)
      case 'delete-macro':
        return this.deleteMacro(cmd)
      case 'move-macro':
        return this.moveMacro(cmd)
      case 'resize-macro':
        return this.resizeMacro(cmd)
      case 'upsert-screen':
        return this.upsertScreen(cmd)
      case 'delete-screen':
        return this.deleteScreen(cmd)
      case 'update-settings':
        return this.updateSettings(cmd)
      default: {
        const never: never = cmd
        return err('invalid-message', `Unknown command: ${JSON.stringify(never)}`)
      }
    }
  }

  upsertPlugin(plugin: InstalledPlugin): StatePatch {
    this.state.plugins ??= {}
    this.state.plugins[plugin.id] = plugin
    return { type: 'state-patch', plugins: { [plugin.id]: plugin } }
  }

  private upsertMacro(cmd: Extract<StateCommand, { type: 'upsert-macro' }>): StatePatch | ProtocolError {
    const { placement } = cmd
    let screen: MacroScreen | undefined
    if (placement) {
      screen = this.state.screens[placement.screenId]
      if (!screen) return err('unknown-screen', `No screen ${placement.screenId}`)
      const bad = this.outOfRange(screen, placement.position)
      if (bad) return bad
      const covering = resolveLayout(screen, this.state.macros).owner[placement.position.row]![
        placement.position.column
      ]
      if (covering && covering !== cmd.macro.id) {
        return err('invalid-message', `Cell ${placement.position.row},${placement.position.column} is taken`)
      }
    }

    // Only resize-macro changes a span, so an edit that rebuilt the macro without one can't lose it.
    const { span: _ignored, ...rest } = cmd.macro
    const kept = this.state.macros[cmd.macro.id]?.span
    const macro: Macro = kept ? { ...rest, span: kept } : rest
    this.state.macros[macro.id] = macro
    const patch: StatePatch = { type: 'state-patch', macros: { [macro.id]: macro } }

    if (placement && screen) {
      screen.macroRows[placement.position.row]!.macrosIds[placement.position.column] = macro.id
      patch.screens = { [screen.id]: screen }
    }

    return patch
  }

  private deleteMacro(cmd: Extract<StateCommand, { type: 'delete-macro' }>): StatePatch | ProtocolError {
    const screen = this.state.screens[cmd.screenId]
    if (!screen) return err('unknown-screen', `No screen ${cmd.screenId}`)
    const bad = this.outOfRange(screen, cmd.position)
    if (bad) return bad

    const macroId = screen.macroRows[cmd.position.row]!.macrosIds[cmd.position.column]
    if (!macroId) return { type: 'state-patch' }

    const { [macroId]: _removed, ...remainingMacros } = this.state.macros
    this.state.macros = remainingMacros
    screen.macroRows[cmd.position.row]!.macrosIds[cmd.position.column] = ''
    return { type: 'state-patch', macros: { [macroId]: null }, screens: { [screen.id]: screen } }
  }

  private moveMacro(cmd: Extract<StateCommand, { type: 'move-macro' }>): StatePatch | ProtocolError {
    const screen = this.state.screens[cmd.screenId]
    if (!screen) return err('unknown-screen', `No screen ${cmd.screenId}`)
    const bad = this.outOfRange(screen, cmd.from) || this.outOfRange(screen, cmd.to)
    if (bad) return bad

    const macroId = screen.macroRows[cmd.from.row]!.macrosIds[cmd.from.column]
    if (!macroId) return { type: 'state-patch' }

    // The macro goes if its cells are free, or swaps with the one macro in the way.
    // If it can't, nothing changes.
    const plan = planMove(screen, this.state.macros, cmd.from, cmd.to)
    if (!plan) return { type: 'state-patch' }
    applyAssignments(screen, plan)
    return { type: 'state-patch', screens: { [screen.id]: screen } }
  }

  private resizeMacro(cmd: Extract<StateCommand, { type: 'resize-macro' }>): StatePatch | ProtocolError {
    const screen = this.state.screens[cmd.screenId]
    if (!screen) return err('unknown-screen', `No screen ${cmd.screenId}`)
    const bad = this.outOfRange(screen, cmd.position)
    if (bad) return bad

    const placed = resolveLayout(screen, this.state.macros).placements.find(
      (p) => p.row === cmd.position.row && p.column === cmd.position.column,
    )
    const macro = placed && this.state.macros[placed.macroId]
    if (!placed || !macro) return err('unknown-macro', `No macro at ${cmd.position.row},${cmd.position.column}`)

    const anchor = cmd.anchor ?? cmd.position
    const badAnchor = this.outOfRange(screen, anchor)
    if (badAnchor) return badAnchor
    if (!fits(screen, this.state.macros, placed.macroId, anchor, cmd.span)) {
      return err('invalid-message', `A ${cmd.span.rows}x${cmd.span.columns} macro does not fit there`)
    }

    const { span: _old, ...rest } = macro
    const next: Macro = isUnitSpan(cmd.span)
      ? rest
      : { ...rest, span: { rows: cmd.span.rows, columns: cmd.span.columns } }
    this.state.macros[placed.macroId] = next
    const patch: StatePatch = { type: 'state-patch', macros: { [placed.macroId]: next } }
    if (anchor.row !== cmd.position.row || anchor.column !== cmd.position.column) {
      applyAssignments(screen, [{ macroId: placed.macroId, from: cmd.position, to: anchor }])
      patch.screens = { [screen.id]: screen }
    }
    return patch
  }

  private upsertScreen(cmd: Extract<StateCommand, { type: 'upsert-screen' }>): StatePatch {
    const screen = normalizeScreen(cmd.screen)
    this.state.screens[screen.id] = screen
    return { type: 'state-patch', screens: { [screen.id]: screen } }
  }

  private deleteScreen(cmd: Extract<StateCommand, { type: 'delete-screen' }>): StatePatch | ProtocolError {
    const screen = this.state.screens[cmd.screenId]
    if (!screen) return err('unknown-screen', `No screen ${cmd.screenId}`)

    // Deleting a screen deletes every macro placed on it (SC-08).
    const removedMacros: Record<string, null> = {}
    for (const row of screen.macroRows) {
      for (const macroId of row.macrosIds) {
        if (macroId && this.state.macros[macroId]) {
          const { [macroId]: _removed, ...remaining } = this.state.macros
          this.state.macros = remaining
          removedMacros[macroId] = null
        }
      }
    }

    const { [cmd.screenId]: _removedScreen, ...remainingScreens } = this.state.screens
    this.state.screens = remainingScreens
    return {
      type: 'state-patch',
      screens: { [cmd.screenId]: null },
      ...(Object.keys(removedMacros).length ? { macros: removedMacros } : {}),
    }
  }

  private updateSettings(cmd: Extract<StateCommand, { type: 'update-settings' }>): StatePatch {
    // `settings` is optional on a fresh state file (ST-01).
    this.state.settings = { ...this.state.settings, ...cmd.settings } as MacroState['settings']
    return { type: 'state-patch', settings: cmd.settings }
  }

  private outOfRange(screen: MacroScreen, pos: { row: number; column: number }): ProtocolError | null {
    if (pos.row < 0 || pos.column < 0 || pos.row >= screen.macroRows.length || pos.column >= screen.size.columns) {
      return err('invalid-message', `Position ${pos.row},${pos.column} is outside screen ${screen.id}`)
    }
    return null
  }
}
