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
  /**
   * The pairing token, required of clients connecting from another device.
   *
   * Connections from this computer are accepted without one, so the desktop
   * editor and the MacroPad window never carry it. A remote client that sends
   * no token, or a stale one, is refused with `invalid-token` (MAC-31).
   */
  token?: string
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
 * `catalogs` and `pairingToken` are sent to editors only. `actionState` is sent
 * to controllers, and omitted while no Action Server could produce it — an
 * absent field means "not available", an empty one would mean "nothing to
 * show", and those are different. An action server usually registers after an
 * editor connects, so editors also get {@link CatalogsMessage} when the set of
 * nodes changes.
 */
export interface Snapshot {
  type: 'snapshot'
  protocolVersion: number
  state: MacroState
  /** Editor only. One catalog per connected node; empty when none is connected. */
  catalogs?: Record<NodeId, ActionCatalog>
  /**
   * Editor only. The token a remote client needs, so the connect page can put
   * it in the URL it advertises. Sent to local editors only — an editor that
   * had to present a token to get here already knows it.
   */
  pairingToken?: string
  /**
   * Controller only. The latest reading of each watched action — one on a
   * screen some controller is viewing. Absent while no Action Server is connected.
   */
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
