import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalPluginPayload, isSafePluginPath, validatePluginFiles, type PluginFiles } from '../shared/types/plugin'
import { readManifest } from './plugin-manifest'

export const validId = (id: string): boolean => /^[a-z0-9-]+$/.test(id) && !id.startsWith('core-')
export class PluginCache {
  readonly root: string
  constructor(private readonly dataRoot: string) {
    this.root = path.join(dataRoot, 'plugin-cache')
  }
  async ids(): Promise<string[]> {
    try {
      return (await readdir(this.root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && validId(entry.name))
        .map((entry) => entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Cannot read plugin cache:', error)
      return []
    }
  }
  async entries(): Promise<{ id: string; sha256: string }[]> {
    const result: { id: string; sha256: string }[] = []
    for (const id of await this.ids()) {
      const parent = path.join(this.root, id)
      for (const sha256 of await readdir(parent).catch(() => [] as string[])) {
        if (!/^[a-f0-9]{64}$/.test(sha256)) continue
        const dir = path.join(parent, sha256)
        try {
          const files: PluginFiles = {}
          const walk = async (current: string, prefix = ''): Promise<void> => {
            const info = await lstat(current)
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid cache directory')
            for (const name of await readdir(current)) {
              const relative = prefix ? `${prefix}/${name}` : name
              const file = path.join(current, name)
              const stat = await lstat(file)
              if (stat.isSymbolicLink()) throw new Error('Symlink in cache')
              if (stat.isDirectory()) await walk(file, relative)
              else if (stat.isFile()) files[relative] = (await readFile(file)).toString('base64')
              else throw new Error('Invalid cache file')
            }
          }
          await walk(dir)
          if (
            !validatePluginFiles(files).ok ||
            createHash('sha256').update(canonicalPluginPayload(files)).digest('hex') !== sha256
          )
            throw new Error('Invalid cache hash')
          result.push({ id, sha256 })
        } catch {
          await rm(dir, { recursive: true, force: true })
        }
      }
    }
    return result
  }
  async install(id: string, sha256: string, files: PluginFiles): Promise<void> {
    if (!validId(id) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid package')
    const validation = validatePluginFiles(files)
    if (!validation.ok) throw new Error(validation.error)
    if (createHash('sha256').update(canonicalPluginPayload(files)).digest('hex') !== sha256)
      throw new Error('Package hash mismatch')
    const manifest = readManifest(
      JSON.parse(Buffer.from(files['package.json'] ?? '', 'base64').toString('utf8')) as unknown,
    )
    if (
      manifest.id !== id ||
      !isSafePluginPath(manifest.server ?? 'server.mjs') ||
      !Object.hasOwn(files, manifest.server ?? 'server.mjs')
    )
      throw new Error('Invalid package manifest')
    const parent = path.join(this.root, id)
    await mkdir(this.root, { recursive: true })
    try {
      const info = await lstat(parent)
      if (!info.isDirectory() || info.isSymbolicLink()) await rm(parent, { recursive: true, force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(parent, { recursive: true })
    const temp = path.join(parent, `.tmp-${randomUUID()}`)
    const target = path.join(parent, sha256)
    try {
      await mkdir(temp)
      for (const [name, encoded] of Object.entries(files)) {
        const dest = path.join(temp, name)
        await mkdir(path.dirname(dest), { recursive: true })
        await writeFile(dest, Buffer.from(encoded, 'base64'))
      }
      await rm(target, { recursive: true, force: true })
      await rename(temp, target)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }
  async remove(id: string, sha256?: string): Promise<void> {
    if (validId(id))
      await rm(path.join(this.root, id, ...(sha256 ? [sha256] : [])), {
        recursive: true,
        force: true,
      })
  }
  /** Plugins with secrets or a data folder on this node, installed or not. */
  async storedIds(): Promise<string[]> {
    const list = async (dir: string, pick: (name: string, isDir: boolean) => string | undefined) => {
      try {
        return (await readdir(path.join(this.dataRoot, dir), { withFileTypes: true }))
          .map((entry) => pick(entry.name, entry.isDirectory()))
          .filter((id): id is string => !!id && validId(id))
      } catch {
        return []
      }
    }
    const secrets = await list('plugin-secrets', (name, isDir) =>
      !isDir && name.endsWith('.json') ? name.slice(0, -'.json'.length) : undefined,
    )
    const data = await list('plugin-data', (name, isDir) => (isDir ? name : undefined))
    return [...new Set([...secrets, ...data])]
  }
  /** Delete an uninstalled plugin's secrets and data folder. */
  async purge(id: string): Promise<void> {
    if (!validId(id)) return
    await rm(path.join(this.dataRoot, 'plugin-secrets', `${id}.json`), { force: true })
    await rm(path.join(this.dataRoot, 'plugin-data', id), { recursive: true, force: true })
  }
  async secrets(id: string): Promise<Record<string, string>> {
    try {
      const value: unknown = JSON.parse(
        await readFile(path.join(this.dataRoot, 'plugin-secrets', `${id}.json`), 'utf8'),
      )
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<
          string,
          string
        >
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Cannot read secrets for ${id}`)
    }
    return {}
  }
  async writeSecrets(id: string, values: Record<string, string | null>): Promise<Record<string, string>> {
    if (!validId(id) && !/^core-[a-z0-9-]+$/.test(id)) throw new Error('Invalid plugin id')
    const secrets = await this.secrets(id)
    for (const [key, value] of Object.entries(values)) {
      if (value === null) Reflect.deleteProperty(secrets, key)
      else if (typeof value === 'string')
        Object.defineProperty(secrets, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        })
    }
    const dir = path.join(this.dataRoot, 'plugin-secrets')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700)
    const target = path.join(dir, `${id}.json`)
    const temp = path.join(dir, `.tmp-${randomUUID()}`)
    try {
      await writeFile(temp, JSON.stringify(secrets), { mode: 0o600 })
      await rename(temp, target)
      await chmod(target, 0o600)
    } finally {
      await rm(temp, { force: true })
    }
    return secrets
  }
}
