/**
 * MacroTouch plugin SDK: the code-side contract between a plugin's `server.mjs`
 * and the action server that loads it. Guide: `docs/plugin-system.md`.
 *
 * Plugins only touch the OS through what they import themselves or what `ctx`
 * gives them, so the host can later move each plugin into its own process
 * without changing plugin code.
 *
 * Built-in plugins in `plugins/core-*` import this by path. A third-party
 * plugin bundles it (it is types plus two identity helpers).
 */
import type { OSPlatform } from '../shared/platform'
import type { ActionField, ActionStateInfo } from '../shared/types/action'
import type { ActionAppearance, ActionStateValue } from '../shared/types/actionState'
import type { ActionOption, Availability, PluginActionManifest, PluginManifest, PluginOS } from '../shared/types/plugin'
import type { PluginTestResult } from '../shared/protocol/plugins'

export type {
  ActionField,
  ActionOption,
  ActionStateInfo,
  ActionStateValue,
  ActionAppearance,
  Availability,
  PluginManifest,
  PluginOS,
  PluginTestResult,
}
export { ActionType } from '../shared/types/action'

export type Parameters = Record<string, unknown> | undefined

/** What the host gives a plugin. One per plugin, created before `activate`. */
export interface PluginContext {
  pluginId: string
  platform: OSPlatform
  /** Non-secret settings, system-wide (from the master). Updated in place when they change. */
  settings: Record<string, unknown>
  /** Secrets from this action server's 0600 file. Updated in place when they change. */
  secrets: Record<string, string>
  /** A folder the plugin may keep files in. */
  dataDir: string
  log: Pick<Console, 'log' | 'warn' | 'error'>
  /** Run a shell command; resolves with stdout, rejects on a non-zero exit. */
  exec(command: string): Promise<string>
  /** Run a program without a shell; resolves with stdout, rejects on failure (ENOENT included). */
  spawn(command: string, args: string[]): Promise<string>
}

export type ActionHandler = (parameters: Parameters, ctx: PluginContext) => unknown | Promise<unknown>

/** A code-side check: same result shape as the manifest's templated checks. */
export type CodeCheck = (ctx: PluginContext, parameters?: Parameters) => Availability | Promise<Availability>

/** Live state, polled with `get` or pushed with `subscribe` (at least one). */
export interface PluginActionState extends ActionStateInfo {
  get?(parameters: Parameters, ctx: PluginContext): ActionStateValue | Promise<ActionStateValue>
  /** Call `emit` on every change; return a function that stops. */
  subscribe?(
    parameters: Parameters,
    emit: (value: ActionStateValue, appearance?: ActionAppearance) => void,
    ctx: PluginContext,
  ): () => void
}

export interface PluginAction extends PluginActionManifest {
  /** Short id; the full id is `<pluginId>/<id>`. */
  id: string
  label: string
  actionFields: ActionField[]
  /** Runs on every supported OS. Give this or `impl`. */
  execute?: ActionHandler
  /** Per-OS code; an OS with no entry is unsupported. */
  impl?: Partial<Record<PluginOS, ActionHandler>>
  states?: PluginActionState[]
  /** Escape hatch for compatibility the manifest's checks can't express. */
  check?: CodeCheck
  /** Escape hatch for readiness the manifest's checks can't express. */
  isReady?: CodeCheck
  /** Runtime options for fields marked `dynamicOptions`, keyed by field key. */
  options?: Record<string, (parameters: Parameters, ctx: PluginContext) => ActionOption[] | Promise<ActionOption[]>>
}

export interface PluginActivation {
  dispose?(): void | Promise<void>
}

/** The default export of a plugin's server entry. */
export interface PluginModule {
  actions: PluginAction[]
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- activate may return nothing
  activate?(ctx: PluginContext): void | PluginActivation | Promise<void | PluginActivation>
  /** Plugin-wide code check. */
  check?: CodeCheck
  isReady?: CodeCheck
  /**
   * Called after `ctx.settings` or `ctx.secrets` change. Without it, the host
   * disposes the plugin's activation and calls `activate` again.
   */
  onSettingsChanged?(ctx: PluginContext): void | Promise<void>
  /**
   * A connection test the user can run from Settings → Plugins ("Test
   * connection"). Check the real thing now, without caching, and say what's
   * wrong in words: "Home Assistant rejected the access token", not "failed".
   * Readiness is rechecked afterwards.
   */
  test?(ctx: PluginContext): PluginTestResult | Promise<PluginTestResult>
}

export const definePlugin = (plugin: PluginModule): PluginModule => plugin
export const defineAction = (action: PluginAction): PluginAction => action

export const ok = (): Availability => ({ status: 'available' })
export const notReady = (message: string, hint?: string): Availability => ({ status: 'not-ready', message, hint })
export const missing = (message: string, hint?: string): Availability => ({
  status: 'missing-dependency',
  message,
  hint,
})
