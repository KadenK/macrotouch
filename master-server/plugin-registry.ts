import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { readManifest } from '../action-server/plugin-manifest'
import {
  canonicalPluginPayload,
  isFaceManifest,
  isSafePluginPath,
  validatePluginFiles,
  type InstalledPlugin,
  type PluginFiles,
} from '../shared/types/plugin'

export class PluginRegistry {
  private packages = new Map<string, { sha256: string; files: PluginFiles }>()
  private directory: string
  private current?: () => Record<string, InstalledPlugin> | undefined

  constructor(dataRoot: string) {
    this.directory = path.join(dataRoot, 'plugin-store')
    fs.mkdirSync(this.directory, { recursive: true })
    for (const name of fs.readdirSync(this.directory)) {
      if (!name.endsWith('.json')) continue
      try {
        const stored = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')) as {
          sha256: string
          files: PluginFiles
        }
        const checked = this.validate(stored.files)
        if (`${checked.manifest.id}.json` === name && checked.sha256 === stored.sha256)
          this.packages.set(checked.manifest.id, stored)
      } catch (error) {
        console.warn('[plugins] Ignoring invalid stored package:', name, error)
      }
    }
  }

  private validate(files: PluginFiles) {
    const validation = validatePluginFiles(files)
    if (!validation.ok) throw new Error(validation.error)
    const manifest = readManifest(JSON.parse(Buffer.from(files['package.json']!, 'base64').toString('utf8')))
    if (manifest.id.startsWith('core-')) throw new Error('Reserved plugin id')
    if (manifest.faces !== undefined && (!Array.isArray(manifest.faces) || !manifest.faces.every(isFaceManifest)))
      throw new Error('Invalid face manifest')

    const server = manifest.server ?? 'server.mjs'
    // A UI-only plugin (faces, no actions) needs no server entry unless it names one.
    const uiOnly = !!manifest.ui && !manifest.server && !Object.hasOwn(files, server)
    if (!uiOnly && (!isSafePluginPath(server) || !Object.hasOwn(files, server))) throw new Error('Missing server entry')
    if (manifest.ui && (!isSafePluginPath(manifest.ui) || !Object.hasOwn(files, manifest.ui)))
      throw new Error('Missing UI entry')
    const sha256 = createHash('sha256').update(canonicalPluginPayload(files)).digest('hex')
    return { manifest, sha256 }
  }

  install(files: PluginFiles, existing?: Record<string, InstalledPlugin>): InstalledPlugin {
    const { manifest, sha256 } = this.validate(files)
    const previous = existing && Object.hasOwn(existing, manifest.id) ? existing[manifest.id] : undefined
    const secretKeys = new Set(manifest.settings?.filter((field) => field.secret).map((field) => field.key))
    const settings = Object.fromEntries(
      Object.entries(previous?.settings ?? {}).filter(([key]) => !secretKeys.has(key)),
    )
    const record: InstalledPlugin = {
      id: manifest.id,
      label: manifest.label,
      version: manifest.version,
      sha256,
      enabled: previous?.enabled ?? true,
      settings,
      installedAt: Date.now(),
      ...(manifest.settings ? { settingFields: manifest.settings } : {}),
      ...(manifest.icon ? { icon: manifest.icon } : {}),
      ...(manifest.faces ? { faces: manifest.faces } : {}),
      ...(manifest.ui ? { uiUrl: `/plugins/${manifest.id}/${sha256}/${manifest.ui}` } : {}),
    }
    const target = path.join(this.directory, `${manifest.id}.json`)
    const temp = `${target}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(temp, JSON.stringify({ sha256, files }))
      fs.renameSync(temp, target)
    } finally {
      fs.rmSync(temp, { force: true })
    }
    this.packages.set(manifest.id, { sha256, files })
    return record
  }

  setCurrentState(getPlugins: () => Record<string, InstalledPlugin> | undefined): void {
    this.current = getPlugins
  }

  get(id: string, sha256: string): PluginFiles | undefined {
    const current = this.current?.()
    if (this.current && (!current || !Object.hasOwn(current, id) || current[id]?.sha256 !== sha256)) return undefined
    const pkg = this.packages.get(id)
    return pkg?.sha256 === sha256 ? pkg.files : undefined
  }

  delete(id: string): void {
    if (!/^[a-z0-9-]+$/.test(id)) return
    fs.rmSync(path.join(this.directory, `${id}.json`), { force: true })
    this.packages.delete(id)
  }
}
