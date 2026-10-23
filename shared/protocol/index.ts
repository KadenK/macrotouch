/**
 * The MacroTouch message protocol.
 *
 * Every message between the master server, the editor, the controller, the
 * Action Server, and Electron is declared here. Types only — no transport, no
 * behavior.
 *
 * Two rules keep this directory importable from every process:
 *
 * - Relative imports only. The master and the Action Server run as plain Node
 *   entry points, outside Nuxt's resolver, so `~` and `#shared` are unavailable
 *   to them.
 * - No runtime values but {@link PROTOCOL_VERSION}. `import type` elsewhere
 *   erases on compile, which keeps this safe to import from Electron too.
 */

import type { ActionResult, ActionStateMessage, MacroTrigger, RunAction, ViewScreen, WatchActions } from './actions'
import type { StateCommand } from './commands'
import type { ProtocolErrorMessage } from './errors'
import type { CatalogsMessage, ControllerHello, EditorHello, Hello, NodeHello, Snapshot } from './handshake'
import type { Quit } from './lifecycle'
import type { StatePatch } from './sync'

export * from './version'
export * from './errors'
export * from './handshake'
export * from './commands'
export * from './sync'
export * from './actions'
export * from './lifecycle'

/**
 * Messages are grouped by direction, not pooled into one union.
 *
 * Each process narrows over its own inbox. A single flat union would force
 * every handler to carry cases it can never receive.
 */

/** Editor or controller to master. */
export type ClientToMasterMessage = EditorHello | ControllerHello | StateCommand | MacroTrigger | ViewScreen

/** Master to editor or controller. */
export type MasterToClientMessage =
  | Snapshot
  | CatalogsMessage
  | StatePatch
  | ActionResult
  | ActionStateMessage
  | ProtocolErrorMessage

/** Action Server to master. */
export type NodeToMasterMessage = NodeHello | ActionResult | ActionStateMessage

/** Master to Action Server. */
export type MasterToNodeMessage = RunAction | WatchActions | Quit

/** Electron to master. */
export type DesktopToMasterMessage = Quit

/**
 * Every message in the protocol, in any direction.
 *
 * `Hello` is referenced here rather than reached through the direction unions,
 * which each carry only the role they accept.
 */
export type ProtocolMessage =
  | Hello
  | ClientToMasterMessage
  | MasterToClientMessage
  | NodeToMasterMessage
  | MasterToNodeMessage
  | DesktopToMasterMessage

export type ProtocolMessageType = ProtocolMessage['type']
