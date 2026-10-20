import type { ActionCatalog, NodeId } from '../../types/node'
import type { ActionStateEntry, ActionStateKey } from '../../types/actionState'
import type { MacroState } from '../../types/state'
import type { OSPlatform } from '../../util/platform'

/**
 * First message on every connection, in both directions, before anything else.
 *
 * `protocolVersion` sits outside the role split so a mismatch can be reported
 * without first understanding the rest of the message.
 */
interface HelloBase {
  type: 'hello'
  protocolVersion: number
}

/** The desktop editor: builds screens and macros. */
export type EditorHello = HelloBase & {
  role: 'editor'
}

/** A phone or tablet running the controller. */
export type ControllerHello = HelloBase & {
  role: 'controller'
  /** The screen already in view, when the client is reconnecting. */
  screenId?: string
}

/** An Action Server, announcing itself and what it can run. */
export type NodeHello = HelloBase & {
  role: 'node'
  nodeId: NodeId
  label: string
  platform: OSPlatform
  catalog: ActionCatalog
}

export type Hello = EditorHello | ControllerHello | NodeHello

export type ProtocolRole = Hello['role']

/**
 * The master's reply to a client `hello`: everything that client needs before
 * it can render.
 *
 * `catalogs` arrives with the Action Server (MAC-41) and `actionState` with
 * live action state (Demo 2). Both are omitted until something produces them —
 * an absent field means "not available", an empty one would mean "nothing to
 * show", and those are different.
 */
export interface Snapshot {
  type: 'snapshot'
  protocolVersion: number
  state: MacroState
  /** Editor only. One catalog per connected node. */
  catalogs?: Record<NodeId, ActionCatalog>
  /** Controller only. Demo 2. */
  actionState?: Record<ActionStateKey, ActionStateEntry>
}
