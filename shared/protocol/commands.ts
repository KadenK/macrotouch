import type { Macro } from '../../types/macro'
import type { MacroScreen, Position } from '../../types/screen'
import type { MacroSettings } from '../../types/state'

/**
 * State commands: client to master, one per user edit.
 *
 * The master owns the state. A client sends what it wants changed and waits for
 * the `state-patch` that comes back; it never sends the whole state.
 */

/** Where a newly created macro goes. */
export interface MacroPlacement {
  screenId: string
  position: Position
}

/**
 * Create or replace a macro. `placement` is set only when creating one, to put
 * it in a cell; editing an existing macro leaves it out.
 */
export interface UpsertMacroCommand {
  type: 'upsert-macro'
  macro: Macro
  placement?: MacroPlacement
}

/** Remove the macro in a cell, and clear the cell. */
export interface DeleteMacroCommand {
  type: 'delete-macro'
  screenId: string
  position: Position
}

/** Move a macro between two cells of one screen. */
export interface MoveMacroCommand {
  type: 'move-macro'
  screenId: string
  from: Position
  to: Position
}

/** Create or replace a screen. */
export interface UpsertScreenCommand {
  type: 'upsert-screen'
  screen: MacroScreen
}

/** Remove a screen and every macro on it. */
export interface DeleteScreenCommand {
  type: 'delete-screen'
  screenId: string
}

/** Change some settings. Fields left out keep their current value. */
export interface UpdateSettingsCommand {
  type: 'update-settings'
  settings: Partial<MacroSettings>
}

export type StateCommand =
  | UpsertMacroCommand
  | DeleteMacroCommand
  | MoveMacroCommand
  | UpsertScreenCommand
  | DeleteScreenCommand
  | UpdateSettingsCommand

export type StateCommandType = StateCommand['type']
