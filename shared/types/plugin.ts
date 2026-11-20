import type { OSPlatform } from '../platform'

/**
 * Plugins: packages of actions (and macro faces) for one product or
 * area. Guide: `docs/plugin-system.md`.
 *
 * Everything in this file is data, so it can travel in a catalog or sit in a
 * `package.json`. The code-side API lives in `plugin-sdk/`.
 */

/** The plugin API version this build of MacroTouch implements. */
export const PLUGIN_API_VERSION = 1

/** The OS keys a per-OS value can use. */
export type PluginOS = 'win32' | 'darwin' | 'linux'

/**
 * A value that can differ per OS. A plain value applies everywhere; a map picks
 * the current OS's entry, else `default`. A map with neither means "not on this
 * OS", which makes the check that uses it pass (it is skipped).
 */
export type PerOS<T> = T | { win32?: T; darwin?: T; linux?: T; default?: T }

/** Shown when a check fails. */
interface CheckText {
  /** e.g. "Steam is not installed". */
  message?: string
  /** e.g. "Install Steam from store.steampowered.com". */
  hint?: string
}

/**
 * A compatibility or readiness check, declared in a plugin's manifest and
 * evaluated by the action server without loading plugin code.
 *
 * Values support template variables: `${home}`, `${env:NAME}`, `${platform}`,
 * `${arch}`, `${dataDir}`, `${setting:KEY}`. A list of names or paths passes
 * when any entry passes.
 */
export type CheckSpec = CheckText &
  (
    | {
        /** An executable on PATH (or an absolute path). */
        type: 'command'
        name: PerOS<string | string[]>
        /** When set, the command is run with these args and must exit with `exitCode` (default 0). */
        args?: string[]
        exitCode?: number
        /** Regex its stdout must match. Implies running it. */
        outputMatches?: string
      }
    | { type: 'file' | 'dir'; path: PerOS<string | string[]> }
    | { type: 'process'; name: PerOS<string | string[]> }
    | { type: 'env'; name: string }
    | {
        /** Windows only; skipped elsewhere. e.g. `HKCU\\Software\\Valve\\Steam`. */
        type: 'registry'
        key: string
        value?: string
      }
    | { type: 'http'; url: string; status?: number; timeoutMs?: number }
    /** A plugin setting or secret is set. Fails as `not-configured`. */
    | { type: 'setting'; key: string }
    | { anyOf: CheckSpec[] }
    | { allOf: CheckSpec[] }
    | { not: CheckSpec }
  )

/** A check written inline, or the name of one in the manifest's `checks`. */
export type CheckRef = string | CheckSpec

/** One plugin-level setting, edited in Settings → Plugins. */
export interface PluginSettingField {
  key: string
  label: string
  type: 'string' | 'enum' | 'boolean' | 'number'
  options?: string[]
  /** Write-only; stored only on each action server, never in the state file. */
  secret?: boolean
  required?: boolean
}

/** Per-action declarations kept in the manifest, so the host can evaluate them without code. */
export interface PluginActionManifest {
  /** Sub-heading inside the plugin's group in the action picker, e.g. "Voice". */
  group?: string
  /** One line shown under the label in the action picker. */
  description?: string
  /** Iconify name, e.g. `ic:baseline-keyboard`. */
  icon?: string
  /**
   * The face its macros are drawn with: a standard one (`icon`, `value`)
   * or the `id` of one of this plugin's own faces. Left out, the
   * standard face for the action's live state ({@link defaultFaceId}).
   */
  face?: string
  platforms?: PluginOS[]
  /** Compatibility: can this machine ever run it? Failing hides it as `missing-dependency`. */
  requires?: CheckRef[]
  /** Readiness: can it run right now? Failing warns as `not-ready`. */
  ready?: CheckRef[]
}

/** The `macrotouch` key of a plugin's `package.json`, plus its `name` and `version`. */
export interface PluginManifest {
  /** Stable id, `[a-z0-9-]+`. Namespaces every action: `<id>/<actionId>`. */
  id: string
  label: string
  /** From `package.json`. */
  version: string
  /** Must not exceed {@link PLUGIN_API_VERSION}. */
  apiVersion: number
  /** Omitted: every OS. */
  platforms?: PluginOS[]
  /** Server entry, relative to the package. Default `server.mjs`. Ignored for built-ins. */
  server?: string
  /** Optional browser entry that defines the plugin's faces and face settings as custom elements. */
  ui?: string
  icon?: string
  settings?: PluginSettingField[]
  /** Named checks that `requires` / `ready` refer to. */
  checks?: Record<string, CheckSpec>
  /** Plugin-wide compatibility checks. */
  requires?: CheckRef[]
  /** Plugin-wide readiness checks. */
  ready?: CheckRef[]
  /** Faces shipped in `ui`. */
  faces?: PluginFaceManifest[]
  /** Keyed by the action's short id (without the plugin prefix). */
  actions?: Record<string, PluginActionManifest>
}

/**
 * Whether an action (or a whole plugin) can run on one action server.
 *
 * - `available`: runs.
 * - `not-ready` / `not-configured`: shown and selectable, but a run fails with
 *   the message until fixed (Steam not running, token not set).
 * - `unsupported-platform` / `missing-dependency` / `plugin-error`: greyed out.
 */
export type AvailabilityStatus =
  'available' | 'not-ready' | 'not-configured' | 'unsupported-platform' | 'missing-dependency' | 'plugin-error'

export interface Availability {
  status: AvailabilityStatus
  message?: string
  hint?: string
}

export const AVAILABLE: Availability = { status: 'available' }

/** Shown and selectable in the editor (possibly with a warning). */
export function isSelectable(availability: Availability | undefined): boolean {
  const status = availability?.status ?? 'available'
  return status === 'available' || status === 'not-ready' || status === 'not-configured'
}

/** Runs right now. A missing availability (an older node) counts as available. */
export function isRunnable(availability: Availability | undefined): boolean {
  return (availability?.status ?? 'available') === 'available'
}

/** Whether an action can be chosen: it and its plugin are both available enough. */
export function actionSelectable(
  group: { availability?: Availability },
  action: { availability?: Availability },
): boolean {
  return isSelectable(group.availability) && isSelectable(action.availability)
}

/** The full id of a plugin's action. */
export function pluginActionId(pluginId: string, actionId: string): string {
  return `${pluginId}/${actionId}`
}

/** Whether `platforms` (omitted = all) includes `platform`. */
export function supportsPlatform(platforms: readonly PluginOS[] | undefined, platform: OSPlatform): boolean {
  return !platforms || platforms.includes(platform as PluginOS)
}

/**
 * A plugin package as it travels and is stored: relative path to base64 file
 * contents. `package.json` sits at the root. There is no archive format, so an
 * editor can build one from a picked folder and the master never unpacks a tarball.
 */
export type PluginFiles = Record<string, string>

/** Limits the master and every action server enforce on a {@link PluginFiles}. */
export const PLUGIN_PACKAGE_LIMITS = { maxFiles: 500, maxTotalBytes: 20 * 1024 * 1024 } as const

/**
 * A relative path that stays inside the package: no absolute paths, drive
 * letters, backslashes, `.`/`..` segments, or empty segments.
 */
export function isSafePluginPath(relPath: string): boolean {
  if (!relPath || relPath.length > 512 || relPath.includes('\\') || relPath.includes('\0')) return false
  if (relPath.startsWith('/') || /^[a-zA-Z]:/.test(relPath)) return false
  return relPath.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** One installed (non-built-in) plugin, as the master records it in {@link MacroState.plugins}. */
export interface InstalledPlugin {
  id: string
  label: string
  version: string
  /** Hex sha256 of {@link canonicalPluginPayload} of the package. Identifies what each node should run. */
  sha256: string
  /** Disabled plugins are removed from every action server but stay installed on the master. */
  enabled: boolean
  /** Non-secret settings, system-wide. Secrets never appear here. */
  settings: Record<string, unknown>
  /** From the manifest, so the editor can draw the settings form even with no node online. */
  settingFields?: PluginSettingField[]
  icon?: string
  /** Where the browser loads the plugin's faces from, e.g. `/plugins/<id>/<sha>/ui.mjs`. */
  uiUrl?: string
  /** Faces the plugin's `ui.mjs` defines. */
  faces?: PluginFaceManifest[]
  /** Epoch ms. */
  installedAt: number
}

/**
 * A face: the visible part of a macro, drawn in its cell. A macro is a button
 * on a screen with a chosen action and a configured face; the action decides
 * which face, and the user configures it with its face settings.
 */
export type StandardFaceId = 'icon' | 'value'
export const STANDARD_FACES: readonly StandardFaceId[] = ['icon', 'value']

/** The standard face for an action's live state kind: a big value for text, else an icon. */
export function defaultFaceId(kind?: 'toggle' | 'range' | 'text'): `core/${StandardFaceId}` {
  return kind === 'text' ? 'core/value' : 'core/icon'
}

/**
 * One face setting, such as the icon or the colors, edited on the right of the
 * macro editor. Each face lists the face settings it depends on, in order, and
 * the macro holds their values.
 *
 * Standard face settings:
 * - `icon`: the macro's icon.
 * - `colors`: foreground and background colors.
 * - `stateIcons`: an icon and colors per live value (toggle actions).
 * - `text`: size, prefix and suffix of a shown value (saved in `Macro.faceSettings.text`).
 */
export type StandardFaceSetting = 'icon' | 'colors' | 'stateIcons' | 'text'
export const STANDARD_FACE_SETTINGS: readonly StandardFaceSetting[] = ['icon', 'colors', 'stateIcons', 'text']

/**
 * A plugin's own face setting: a custom element from its `ui.mjs`. It
 * gets `macro`, `state` and `value` (what it saved before) as properties, and
 * dispatches `change` with the new value, saved as `Macro.faceSettings[id]`.
 */
export interface PluginFaceSetting {
  id: string
  label?: string
  element: string
}
export type FaceSetting = StandardFaceSetting | PluginFaceSetting

/** A face a plugin ships in `ui.mjs`, declared in its manifest (`macrotouch.faces`). */
export interface PluginFaceManifest {
  /** Short id; the full id is `<pluginId>/<id>`. */
  id: string
  label: string
  /**
   * The custom element tag `ui.mjs` defines. It gets `macro`, `entry`, `mode`
   * and `showLabel` as properties, and dispatches `trigger` (detail: a value or nothing).
   */
  element: string
  /** The face settings it depends on, shown in the editor in this order. Default: `['colors']`. */
  settings?: FaceSetting[]
}

/** Checks a face manifest's shape (it comes from an uploaded package). */
export function isFaceManifest(value: unknown): value is PluginFaceManifest {
  if (!value || typeof value !== 'object') return false
  const face = value as Record<string, unknown>
  const isSetting = (s: unknown) =>
    (typeof s === 'string' && (STANDARD_FACE_SETTINGS as readonly string[]).includes(s)) ||
    (!!s &&
      typeof s === 'object' &&
      typeof (s as PluginFaceSetting).id === 'string' &&
      typeof (s as PluginFaceSetting).element === 'string' &&
      ((s as PluginFaceSetting).label === undefined || typeof (s as PluginFaceSetting).label === 'string'))
  return (
    typeof face.id === 'string' &&
    typeof face.label === 'string' &&
    typeof face.element === 'string' &&
    (face.settings === undefined || (Array.isArray(face.settings) && face.settings.every(isSetting)))
  )
}

/** One choice in a field whose options a plugin supplies at runtime (`list-options`). */
export interface ActionOption {
  value: string
  label?: string
}

/**
 * The exact string whose sha256 identifies a package: its files sorted by path,
 * as JSON `[[path, base64], ...]`. The master and each action server hash it the same way.
 */
export function canonicalPluginPayload(files: PluginFiles): string {
  return JSON.stringify(
    Object.keys(files)
      .sort()
      .map((relPath) => [relPath, files[relPath]]),
  )
}

/** File names the action server keeps next to an unpacked package; a package may not contain them. */
export const RESERVED_PLUGIN_PATHS = ['.sha256'] as const

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/**
 * The one validation the master (before reporting "installed") and every
 * action server (before unpacking) run on a package, so they never disagree.
 * Pure: no Node APIs, so it also runs in the editor.
 */
export function validatePluginFiles(files: unknown): { ok: true; totalBytes: number } | { ok: false; error: string } {
  if (!files || typeof files !== 'object' || Array.isArray(files))
    return { ok: false, error: 'Package must be an object' }
  const entries = Object.entries(files as Record<string, unknown>)
  if (!entries.length) return { ok: false, error: 'Package is empty' }
  if (entries.length > PLUGIN_PACKAGE_LIMITS.maxFiles) return { ok: false, error: 'Package has too many files' }
  const folded = new Set<string>()
  let totalBytes = 0
  for (const [relPath, data] of entries) {
    if (!isSafePluginPath(relPath)) return { ok: false, error: `Invalid path: ${relPath}` }
    const lower = relPath.toLowerCase()
    // Case-insensitive file systems (macOS, Windows) would write both to one file.
    if (folded.has(lower)) return { ok: false, error: `Paths differ only by case: ${relPath}` }
    folded.add(lower)
    if ((RESERVED_PLUGIN_PATHS as readonly string[]).some((name) => lower === name || lower.endsWith(`/${name}`)))
      return { ok: false, error: `Reserved file name: ${relPath}` }
    if (typeof data !== 'string' || !BASE64.test(data)) return { ok: false, error: `Invalid base64 in ${relPath}` }
    totalBytes += (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
    if (totalBytes > PLUGIN_PACKAGE_LIMITS.maxTotalBytes) return { ok: false, error: 'Package is too large' }
  }
  if (!folded.has('package.json') || !(files as Record<string, unknown>)['package.json'])
    return { ok: false, error: 'Package has no package.json at its root' }
  return { ok: true, totalBytes }
}
