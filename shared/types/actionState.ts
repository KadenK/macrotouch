import type { Color } from './common'
import type { Icon } from './macro'
import type { NodeId } from './node'

/**
 * Live action state.
 *
 * An Action Server reports typed values (`true`, `0.4`), never visuals. A macro
 * decides how each value looks through {@link Macro.stateAppearance}; an
 * action only supplies {@link ActionAppearance} for visuals it owns outright,
 * such as album art.
 */

/** The current reading of a stateful action, e.g. the system volume. */
export type ActionStateValue = boolean | number | string | null

/** Per-reading overrides for how a macro cell should be drawn. */
export interface ActionAppearance {
  label?: string
  icon?: Icon
  iconColor?: Color
  backgroundColor?: Color
}

/**
 * Identifies one watched action: an `actionId` plus the parameters it was
 * watched with, since the same action watched with different parameters is two
 * separate readings. Built only by {@link actionStateKey}, which the master and
 * the controller share so a controller can find the reading for a macro.
 */
export type ActionStateKey = string

/**
 * The key for an action watched with some parameters.
 *
 * Parameter order is ignored, and no parameters equals an empty object, so two
 * macros bound to the same action share one reading.
 */
export function actionStateKey(actionId: string, parameters?: Record<string, unknown>): ActionStateKey {
  const entries = Object.entries(parameters ?? {})
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.length ? `${actionId}:${JSON.stringify(entries)}` : actionId
}

/** One action the master has asked a node to report on. */
export interface WatchedAction {
  key: ActionStateKey
  actionId: string
  parameters?: Record<string, unknown>
}

/** One reading reported by a node. */
export interface ActionStateEntry {
  key: ActionStateKey
  nodeId: NodeId
  value: ActionStateValue
  appearance?: ActionAppearance
  /** Epoch milliseconds, taken on the node that produced the reading. */
  updatedAt: number
}
