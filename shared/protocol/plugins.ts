import type { NodeId } from '../types/node'
import type { PluginFiles } from '../types/plugin'
import type { RequestId } from './actions'

/**
 * Plugin messages. Guide: `docs/plugin-system.md`.
 *
 * Installing and secrets are accepted from the local editor only, like
 * `regenerate-token`. Enabling, disabling, removing and settings are ordinary
 * state commands (`update-plugin`, `delete-plugin`) with the same local-editor
 * restriction.
 */

/**
 * Local editor to master: install or upgrade a plugin from its files.
 *
 * Answered with `action-result` for `requestId`: `value` is the
 * `InstalledPlugin` on success. The master validates the manifest, stores the
 * package, records it in `MacroState.plugins` (a `state-patch` follows) and
 * pushes `plugin-sync` to every action server.
 */
export interface InstallPlugin {
  type: 'install-plugin'
  requestId: RequestId
  files: PluginFiles
}

/**
 * Local editor to master, relayed unchanged to the named action server(s).
 *
 * The master stores nothing and forwards it to no other client. `null` clears
 * a value. The action server writes its 0600 secrets file and reactivates the
 * plugin; its re-sent `hello` reports which secrets are set.
 */
export interface PluginSecrets {
  type: 'plugin-secrets'
  pluginId: string
  nodeId: NodeId | 'all'
  values: Record<string, string | null>
}

/**
 * Editor to master, then master to the node (with the editor's `requestId`
 * swapped for the master's own, as for `run-action`).
 *
 * Asks a plugin for a field's options. Answered with `action-result` whose
 * `value` is `ActionOption[]`. `nodeId` absent: the local node.
 */
export interface ListOptions {
  type: 'list-options'
  requestId: RequestId
  nodeId?: NodeId
  actionId: string
  field: string
  parameters?: Record<string, unknown>
}

/**
 * Editor to master, then master to the node, routed like `list-options`.
 *
 * Runs the plugin's connection test (`PluginModule.test`) on one action server
 * and rechecks its readiness. Answered with `action-result` whose `value` is a
 * {@link PluginTestResult}. `nodeId` absent: the local node.
 */
export interface TestPlugin {
  type: 'test-plugin'
  requestId: RequestId
  nodeId?: NodeId
  pluginId: string
}

/** The answer to `test-plugin`: whether it worked, in words for the user. */
export interface PluginTestResult {
  ok: boolean
  message: string
}

/** What an action server reports in its `hello` about one installed plugin. */
export interface NodePluginInfo {
  id: string
  sha256: string
}

/** One plugin an action server should run. */
export interface PluginSyncEntry {
  id: string
  sha256: string
  settings: Record<string, unknown>
  /** Sent only when the node's `hello` did not already report this `sha256`. */
  files?: PluginFiles
}

/**
 * Master to action server: the full set of installed, enabled plugins it should run.
 *
 * Desired state, not a diff. The node installs entries it lacks (verifying
 * `sha256`), updates settings, removes any installed plugin not listed, reloads,
 * and re-sends its `hello`. Sent in reply to every node `hello` whose plugin list
 * or settings differ, and to every node whenever the installed set or a plugin's
 * settings change.
 */
export interface PluginSync {
  type: 'plugin-sync'
  plugins: PluginSyncEntry[]
  /**
   * Installed but disabled plugins. The node doesn't run them, but keeps their
   * secrets and data. A plugin in neither list is uninstalled: the node deletes
   * its secrets and data too, even if it was offline when it was removed.
   */
  disabled?: string[]
}
