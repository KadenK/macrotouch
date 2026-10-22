import type { OSPlatform } from '../platform'
import type { Action } from './action'

/** Identifies one Action Server process. Assigned by the node, stable for its lifetime. */
export type NodeId = string

/**
 * One action as it crosses a process boundary.
 *
 * This is {@link Action} without `execute`: the catalog travels from the Action
 * Server to the master and on to the editor, so it can only carry data.
 */
export type ActionDescriptor = Omit<Action, 'execute'>

/** A named group of actions, as the Action Server presents them to the editor. */
export interface ActionGroup {
  id: string
  label: string
  actions: ActionDescriptor[]
}

/** Everything one node can run, grouped for display. */
export interface ActionCatalog {
  groups: ActionGroup[]
}

/** What the master knows about a connected node. */
export interface NodeInfo {
  nodeId: NodeId
  label: string
  platform: OSPlatform
  /** True for the Action Server the master launched on this computer. */
  local: boolean
}
