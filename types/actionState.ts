import type { Color } from './common'
import type { Icon } from './macro'
import type { NodeId } from './node'

/**
 * Live action state (Demo 2).
 *
 * Nothing in Demo 1 produces any of this. The types exist so the protocol does
 * not have to change shape when the state monitor lands.
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
 * separate readings. The master derives the key and both sides echo it rather
 * than re-deriving it from the parameters.
 */
export type ActionStateKey = string

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
