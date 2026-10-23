import type { ActionCatalog, NodeId } from '../types/node'
import type { ActionStateEntry, ActionStateKey } from '../types/actionState'
import type { MacroState } from '../types/state'
import type { OSPlatform } from '../platform'

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
 * `catalogs` is sent to editors only. `actionState` arrives with live action
 * state (Demo 2) and is omitted until something produces it — an absent field
 * means "not available", an empty one would mean "nothing to show", and those
 * are different. An action server usually registers after an editor connects,
 * so editors also get {@link CatalogsMessage} when the set of nodes changes.
 */
export interface Snapshot {
  type: 'snapshot'
  protocolVersion: number
  state: MacroState
  /** Editor only. One catalog per connected node; empty when none is connected. */
  catalogs?: Record<NodeId, ActionCatalog>
  /** Controller only. Demo 2. */
  actionState?: Record<ActionStateKey, ActionStateEntry>
}

/**
 * Master to editor: the connected nodes changed, so here are all their catalogs.
 *
 * Replaces the editor's catalogs outright. Sent when a node registers or
 * disconnects.
 */
export interface CatalogsMessage {
  type: 'catalogs'
  catalogs: Record<NodeId, ActionCatalog>
}
