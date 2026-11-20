import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CodeCheck, PluginAction, PluginContext, PluginModule } from '../plugin-sdk'
import { builtinPlugins } from '../plugins'
import { getPlatform } from '../shared/platform'
import {
  AVAILABLE,
  pluginActionId,
  isSafePluginPath,
  supportsPlatform,
  type Availability,
  type CheckRef,
  type PluginManifest,
} from '../shared/types/plugin'
import { redactSecrets } from './redact'
import { errorText } from '../shared/errors'
import { withTimeout } from './timeout'
import type { PluginTestResult, PluginSyncEntry } from '../shared/protocol/plugins'
import { evaluateCheck } from './checks'
import { resolveDataRoot } from './data-root'
import { createContext } from './plugin-context'
import { readManifest } from './plugin-manifest'
import { PluginCache, validId } from './plugin-cache'
import { toCatalog } from './catalog'

type HostedAction = {
  action: PluginAction
  plugin: HostedPlugin
  ctx: PluginContext
  availability: Availability
  compatibility: Availability
}
export type HostedPlugin = {
  manifest: PluginManifest
  module?: PluginModule
  ctx: PluginContext
  availability: Availability
  actions: HostedAction[]
  dispose?: () => void | Promise<void>
  loadError?: string
  builtin?: boolean
  sha256?: string
  runs?: Set<Promise<unknown>>
}

export class PluginHost {
  private plugins: HostedPlugin[] = []
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setInterval>
  private stale?: ReturnType<typeof setTimeout>
  private refreshing = false
  private cache: PluginCache
  private pendingReloads = new Set<string>()
  private reloadListeners = new Set<(id: string, before: boolean) => void>()
  constructor(private readonly dataRoot = resolveDataRoot()) {
    this.cache = new PluginCache(dataRoot)
  }

  async load(): Promise<void> {
    for (const builtin of builtinPlugins)
      await this.add(builtin.pkg, async () => builtin.module, 'invalid-plugin', true)
    await this.recheck()
    this.timer = setInterval(() => void this.refreshReadiness(), 30000)
  }
  private async loadCached(id: string, sha256: string): Promise<void> {
    const dir = path.join(this.cache.root, id, sha256)
    try {
      const pkg: unknown = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))
      const manifest = readManifest(pkg)
      if (manifest.id !== id || !isSafePluginPath(manifest.server ?? 'server.mjs'))
        throw new Error('Invalid cached manifest')
      await this.add(
        pkg,
        async (m) => {
          const entry = path.resolve(dir, m.server ?? 'server.mjs')
          // A UI-only plugin has faces but no server code, so no actions.
          if (m.ui && !m.server && !existsSync(entry)) return { actions: [] }
          return (await import(`${pathToFileURL(entry).href}?v=${sha256}`)).default
        },
        id,
        false,
        sha256,
      )
    } catch (error) {
      await this.addError(id, redactSecrets(errorText(error), await this.cache.secrets(id)))
    }
  }
  installed() {
    return this.cache.entries()
  }
  onReload(listener: (id: string, before: boolean) => void): void {
    this.reloadListeners.add(listener)
  }
  private reloadEvent(id: string, before: boolean): void {
    for (const listener of this.reloadListeners) listener(id, before)
  }
  private async removePlugin(id: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.id === id && !p.builtin)
    if (!plugin) return
    this.reloadEvent(id, true)
    this.plugins = this.plugins.filter((p) => p !== plugin)
    try {
      await this.waitRuns(plugin)
      await plugin.dispose?.()
    } catch {
      console.warn(`Plugin dispose failed: ${id}`)
    }
  }
  private async settingsChanged(plugin: HostedPlugin): Promise<void> {
    try {
      if (plugin.module?.onSettingsChanged) await plugin.module.onSettingsChanged(plugin.ctx)
      else {
        this.reloadEvent(plugin.manifest.id, true)
        await this.waitRuns(plugin)
        await plugin.dispose?.()
        plugin.dispose = undefined
        this.pendingReloads.add(plugin.manifest.id)
      }
    } catch {
      console.warn(`Plugin settings update failed: ${plugin.manifest.id}`)
    }
  }
  async sync(entries: PluginSyncEntry[], disabled: string[] = []): Promise<void> {
    const before = JSON.stringify([toCatalog(this), await this.installed()])
    const wanted = new Set(entries.filter((e) => validId(e.id)).map((e) => e.id))
    for (const id of await this.cache.ids())
      if (!wanted.has(id)) {
        await this.removePlugin(id)
        await this.cache.remove(id)
        this.pendingReloads.add(id)
      }
    // Uninstalled (neither running nor disabled): its secrets and data go too.
    const installed = new Set([...wanted, ...disabled])
    for (const id of await this.cache.storedIds()) if (!installed.has(id)) await this.cache.purge(id)
    const cached = await this.cache.entries()
    for (const entry of entries) {
      if (!validId(entry.id)) continue
      const current = cached.find((e) => e.id === entry.id && e.sha256 === entry.sha256)
      if (!current) {
        if (!entry.files) {
          continue
        }
        try {
          // Validate and stage before discarding the currently running activation.
          await this.cache.install(entry.id, entry.sha256, entry.files)
        } catch {
          console.warn(`Rejected plugin package: ${entry.id}`)
          continue
        }
      }
      const previous = this.plugins.find((p) => p.manifest.id === entry.id && !p.builtin)
      if (!previous || previous.sha256 !== entry.sha256) {
        await this.removePlugin(entry.id)
        if (previous?.sha256) await this.cache.remove(entry.id, previous.sha256)
        await this.loadCached(entry.id, entry.sha256)
        this.pendingReloads.add(entry.id)
      }
      const plugin = this.plugins.find((p) => p.manifest.id === entry.id && !p.builtin)
      if (plugin && entry.settings && JSON.stringify(plugin.ctx.settings) !== JSON.stringify(entry.settings)) {
        Object.keys(plugin.ctx.settings).forEach((key) => Reflect.deleteProperty(plugin.ctx.settings, key))
        Object.assign(plugin.ctx.settings, entry.settings)
        await this.settingsChanged(plugin)
      }
    }
    await this.recheck(false)
    this.finishReloads()
    if (before !== JSON.stringify([toCatalog(this), await this.installed()])) this.emit()
  }
  async updateSecrets(id: string, values: Record<string, string | null>): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.id === id)
    const before = JSON.stringify(toCatalog(this))
    const secrets = await this.cache.writeSecrets(id, values)
    if (plugin && JSON.stringify(plugin.ctx.secrets) !== JSON.stringify(secrets)) {
      Object.keys(plugin.ctx.secrets).forEach((key) => Reflect.deleteProperty(plugin.ctx.secrets, key))
      Object.assign(plugin.ctx.secrets, secrets)
      await this.settingsChanged(plugin)
      await this.recheck(false)
      this.finishReloads()
    }
    if (before !== JSON.stringify(toCatalog(this))) this.emit()
  }
  /**
   * Run a plugin's connection test, then recheck readiness so its status
   * follows what the test found. Errors and timeouts count as a failed test.
   */
  async test(id: string): Promise<PluginTestResult> {
    const plugin = this.plugins.find((p) => p.manifest.id === id)
    const test = plugin?.module?.test
    if (!plugin || !test) return { ok: false, message: 'This plugin has no connection test' }
    let result: PluginTestResult
    try {
      const value = await withTimeout(() => test(plugin.ctx), 15000, 'The test took longer than 15 seconds')
      result =
        value && typeof value === 'object' && typeof value.ok === 'boolean' && typeof value.message === 'string'
          ? { ok: value.ok, message: value.message }
          : {
              ok: false,
              message: 'The plugin returned an invalid test result',
            }
    } catch (error) {
      result = { ok: false, message: errorText(error) }
    }
    await this.recheck()
    return {
      ok: result.ok,
      message: redactSecrets(result.message, plugin.ctx.secrets),
    }
  }
  private finishReloads(): void {
    for (const id of this.pendingReloads) this.reloadEvent(id, false)
    this.pendingReloads.clear()
  }
  private async addError(id: string, error: string): Promise<void> {
    const safeId = /^[a-z0-9-]+$/.test(id) ? id : 'invalid-plugin'
    if (this.plugins.some((p) => p.manifest.id === safeId)) {
      console.warn(`Duplicate plugin id: ${safeId}`)
      return
    }
    const manifest: PluginManifest = {
      id: safeId,
      label: id,
      version: '',
      apiVersion: 1,
    }
    this.plugins.push({
      manifest,
      ctx: createContext(manifest, this.dataRoot),
      availability: { status: 'plugin-error', message: error },
      actions: [],
      loadError: error,
    })
  }
  private async add(
    pkg: unknown,
    loader: (manifest: PluginManifest) => Promise<PluginModule>,
    fallback = 'invalid-plugin',
    builtin = false,
    sha256?: string,
  ): Promise<void> {
    let manifest: PluginManifest
    try {
      manifest = readManifest(pkg)
    } catch (error) {
      const raw = pkg as {
        macrotouch?: { id?: unknown; label?: unknown }
        name?: unknown
      }
      await this.addError(typeof raw?.macrotouch?.id === 'string' ? raw.macrotouch.id : fallback, errorText(error))
      return
    }
    if (this.plugins.some((p) => p.manifest.id === manifest.id)) {
      console.warn(`Duplicate plugin id: ${manifest.id}`)
      return
    }
    const plugin: HostedPlugin = {
      manifest,
      builtin,
      sha256,
      ctx: createContext(manifest, this.dataRoot),
      availability: AVAILABLE,
      actions: [],
    }
    Object.assign(plugin.ctx.secrets, await this.cache.secrets(manifest.id))
    this.plugins.push(plugin)
    try {
      plugin.module = await loader(manifest)
      if (!plugin.module || !Array.isArray(plugin.module.actions))
        throw new Error('Plugin must export an actions array')
      plugin.actions = plugin.module.actions.map((action) => ({
        action: { ...action, ...manifest.actions?.[action.id] },
        plugin,
        ctx: plugin.ctx,
        availability: AVAILABLE,
        compatibility: AVAILABLE,
      }))
    } catch (error) {
      plugin.loadError = redactSecrets(errorText(error), plugin.ctx.secrets)
      plugin.actions = []
    }
  }
  private async checks(
    plugin: HostedPlugin,
    refs: CheckRef[] | undefined,
    status: 'missing-dependency' | 'not-ready',
  ): Promise<Availability> {
    for (const ref of refs ?? []) {
      const result = await evaluateCheck(ref, {
        manifest: plugin.manifest,
        platform: plugin.ctx.platform,
        settings: plugin.ctx.settings,
        secrets: plugin.ctx.secrets,
        dataDir: plugin.ctx.dataDir,
        status,
      })
      if (!result.pass)
        return {
          status: result.status,
          message: result.message,
          hint: result.hint,
        }
    }
    return AVAILABLE
  }
  private async codeCheck(check: CodeCheck | undefined, ctx: PluginContext): Promise<Availability> {
    if (!check) return AVAILABLE
    try {
      const result = await withTimeout(() => check(ctx), 5000, 'Check timed out')
      return {
        ...result,
        ...(result.message ? { message: redactSecrets(result.message, ctx.secrets) } : {}),
        ...(result.hint ? { hint: redactSecrets(result.hint, ctx.secrets) } : {}),
      }
    } catch (error) {
      return {
        status: 'plugin-error',
        message: redactSecrets(errorText(error), ctx.secrets),
      }
    }
  }
  private unsupported(): Availability {
    const names: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
    }
    return {
      status: 'unsupported-platform',
      message: `Not available on ${names[getPlatform()] ?? getPlatform()}`,
    }
  }
  async recheck(notify = true): Promise<void> {
    const before = JSON.stringify(this.snapshot())
    for (const plugin of this.plugins) {
      if (plugin.loadError) {
        plugin.availability = {
          status: 'plugin-error',
          message: plugin.loadError,
        }
        continue
      }
      let availability = supportsPlatform(plugin.manifest.platforms, plugin.ctx.platform)
        ? await this.checks(plugin, plugin.manifest.requires, 'missing-dependency')
        : this.unsupported()
      if (availability.status === 'available') availability = await this.codeCheck(plugin.module?.check, plugin.ctx)
      if (availability.status === 'available' && !plugin.dispose && plugin.module?.activate) {
        try {
          await mkdir(plugin.ctx.dataDir, { recursive: true })
          const activation = await plugin.module.activate(plugin.ctx)
          plugin.dispose = activation?.dispose?.bind(activation) ?? (() => {})
        } catch (error) {
          availability = {
            status: 'plugin-error',
            message: redactSecrets(errorText(error), plugin.ctx.secrets),
          }
        }
      }
      plugin.availability = availability
      for (const item of plugin.actions) {
        const action = item.action
        let result = availability
        if (
          result.status === 'available' &&
          (!supportsPlatform(action.platforms, plugin.ctx.platform) ||
            (!action.execute && !action.impl?.[plugin.ctx.platform as 'linux' | 'darwin' | 'win32']))
        )
          result = this.unsupported()
        if (result.status === 'available') result = await this.checks(plugin, action.requires, 'missing-dependency')
        if (result.status === 'available') result = await this.codeCheck(action.check, plugin.ctx)
        item.compatibility = result
        item.availability = result.status === 'available' ? await this.readiness(item) : result
      }
    }
    if (notify && before !== JSON.stringify(this.snapshot())) this.emit()
  }
  private async readiness(item: HostedAction): Promise<Availability> {
    const plugin = item.plugin
    for (const refs of [plugin.manifest.ready, item.action.ready]) {
      const result = await this.checks(plugin, refs, 'not-ready')
      if (result.status !== 'available') return result
    }
    for (const check of [plugin.module?.isReady, item.action.isReady]) {
      const result = await this.codeCheck(check, item.ctx)
      if (result.status !== 'available') return result
    }
    return AVAILABLE
  }
  async refreshReadiness(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const before = JSON.stringify(this.snapshot())
      for (const plugin of this.plugins)
        for (const item of plugin.actions)
          item.availability =
            item.compatibility.status === 'available' ? await this.readiness(item) : item.compatibility
      if (before !== JSON.stringify(this.snapshot())) this.emit()
    } finally {
      this.refreshing = false
    }
  }
  async checkReady(id: string, item = this.get(id)): Promise<Availability> {
    if (!item) return { status: 'plugin-error', message: 'Unknown action' }
    const before = JSON.stringify(item.availability)
    item.availability = item.compatibility.status === 'available' ? await this.readiness(item) : item.compatibility
    if (before !== JSON.stringify(item.availability)) this.emit()
    return item.availability
  }
  trackRun(plugin: HostedPlugin, promise: Promise<unknown>): void {
    plugin.runs ??= new Set()
    plugin.runs.add(promise)
    void promise.finally(() => plugin.runs?.delete(promise)).catch(() => {})
  }
  private async waitRuns(plugin: HostedPlugin): Promise<void> {
    if (!plugin.runs?.size) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.allSettled([...plugin.runs]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 30000)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  get(id: string): HostedAction | undefined {
    return this.plugins.flatMap((p) => p.actions).find((a) => pluginActionId(a.plugin.manifest.id, a.action.id) === id)
  }
  groups(): HostedPlugin[] {
    return this.plugins
  }
  markStale(): void {
    if (!this.stale)
      this.stale = setTimeout(() => {
        this.stale = undefined
        void this.recheck()
      }, 0)
  }
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }
  private emit(): void {
    for (const listener of this.listeners) listener()
  }
  private snapshot() {
    return this.plugins.map((p) => [p.availability, p.actions.map((a) => a.availability)])
  }
  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    if (this.stale) clearTimeout(this.stale)
    for (const plugin of this.plugins)
      try {
        await plugin.dispose?.()
      } catch (error) {
        console.warn('Plugin dispose failed:', redactSecrets(errorText(error), plugin.ctx.secrets))
      }
  }
}
