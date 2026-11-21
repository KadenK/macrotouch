import type { OSPlatform } from '../platform'
import type { ActionField, ActionStateInfo } from './action'
import type { Availability, PluginSettingField } from './plugin'

/** Identifies one Action Server process. Assigned by the node, stable for its lifetime. */
export type NodeId = string

/**
 * One action as it crosses a process boundary: the catalog travels from the
 * Action Server to the master and on to the editor, so it can only carry data.
 */
export interface ActionDescriptor {
  actionId: string
  label: string
  actionFields: ActionField[]
  /**
   * What this action can report live, per parameter choice. The first entry
   * whose `when` matches the macro's parameters applies; none matching means
   * the macro is not stateful.
   */
  states?: ActionStateInfo[]
  /** Whether it can run on this node. Absent (older nodes) means available. */
  availability?: Availability
  /** Sub-heading inside its plugin's group, e.g. "Voice". Absent: listed directly under the plugin. */
  group?: string
  /** One line shown under the label in the action picker. */
  description?: string
  /** Iconify name, e.g. `ic:baseline-keyboard`. */
  icon?: string
  /** Full id of the face its macros are drawn with (`core/value`, `<pluginId>/<faceId>`). Absent: the standard face for its state. */
  face?: string
}

/**
 * What the editor may know about a saved secret: its length, and its last
 * {@link SECRET_HINT_END} characters when it is at least {@link SECRET_HINT_MIN_LENGTH}
 * long, so a short secret (a PIN) gives nothing away.
 */
export interface SecretHint {
  length: number
  end?: string
}
export const SECRET_HINT_END = 3
export const SECRET_HINT_MIN_LENGTH = 12
export function secretHint(value: string | undefined): SecretHint | null {
  if (!value) return null
  return value.length >= SECRET_HINT_MIN_LENGTH
    ? { length: value.length, end: value.slice(-SECRET_HINT_END) }
    : { length: value.length }
}

/** A named group of actions, as the Action Server presents them to the editor. */
export interface ActionGroup {
  /** The plugin id. */
  id: string
  label: string
  /** The plugin's version. */
  version?: string
  /** Iconify name, e.g. `ic:baseline-keyboard`. */
  icon?: string
  /** Bundled with the app; cannot be removed or disabled. */
  builtin?: boolean
  /** The plugin's settings fields (manifest `settings`). */
  settings?: PluginSettingField[]
  /** For each secret field: a hint at this node's value, or `null` when it has none. Never the value itself. */
  secretHints?: Record<string, SecretHint | null>
  /** Whether the plugin has a connection test the editor can run (`test-plugin`). */
  testable?: boolean
  /** Plugin-wide availability (OS, plugin `requires`, load errors). Absent means available. */
  availability?: Availability
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

/** How the editor names an action server. */
export function nodeLabel(node: NodeInfo): string {
  return node.local ? 'This computer' : node.label
}
