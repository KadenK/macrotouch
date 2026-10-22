import type { ActionStateEntry, ActionStateValue, WatchedAction } from '../types/actionState'
import type { ProtocolError } from './errors'

/** Correlates a request with the result that answers it. */
export type RequestId = string

/**
 * Controller to master: the user tapped a macro.
 *
 * Distinct from {@link RunAction}. This names a *macro*, and the master decides
 * which action that is and which node should run it.
 */
export interface MacroTrigger {
  type: 'macro-trigger'
  requestId: RequestId
  macroId: string
  /** Set by continuous controls such as a slider. Demo 2. */
  value?: ActionStateValue
}

/**
 * Master to node: run this action.
 *
 * Distinct from {@link MacroTrigger}. The macro has already been resolved; this
 * names the action and the parameters to run it with.
 */
export interface RunAction {
  type: 'run-action'
  requestId: RequestId
  actionId: string
  parameters?: Record<string, unknown>
}

/**
 * Node to master, then master to the client that asked.
 *
 * Carries its own failures, so "the node is offline" and "the action threw"
 * reach the caller the same way, matched by `requestId`.
 */
export type ActionResult = {
  type: 'action-result'
  requestId: RequestId
} & ({ ok: true; value?: unknown } | { ok: false; error: ProtocolError })

/**
 * Controller to master: this screen is now in view.
 *
 * Demo 2 — the master uses it to work out which actions need watching. Nothing
 * in Demo 1 sends it.
 */
export interface ViewScreen {
  type: 'view-screen'
  /** `null` when no screen is in view. */
  screenId: string | null
}

/**
 * Master to node: report on exactly these actions, and no others.
 *
 * The list replaces whatever the node was watching before. Demo 2 — nothing in
 * Demo 1 sends it.
 */
export interface WatchActions {
  type: 'watch-actions'
  actions: WatchedAction[]
}

/**
 * Node to master, then master to the controllers watching.
 *
 * Only readings that changed, or that were just added to the watched set. Demo
 * 2 — nothing in Demo 1 sends it.
 */
export interface ActionStateMessage {
  type: 'action-state'
  states: ActionStateEntry[]
}
