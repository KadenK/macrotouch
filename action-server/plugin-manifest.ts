import { PLUGIN_API_VERSION, type PluginManifest } from '../shared/types/plugin'

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const strings = (x: unknown): boolean => Array.isArray(x) && x.every((v) => typeof v === 'string')
const platforms = (x: unknown): boolean =>
  strings(x) && (x as string[]).every((v) => ['linux', 'darwin', 'win32'].includes(v))

const perOS = (value: unknown): boolean => {
  const scalar = (v: unknown): boolean => typeof v === 'string' || strings(v)
  return (
    scalar(value) ||
    (object(value) &&
      Object.entries(value).every(([key, v]) => ['linux', 'darwin', 'win32', 'default'].includes(key) && scalar(v)))
  )
}
const check = (value: unknown): boolean => {
  if (
    !object(value) ||
    (value.message !== undefined && typeof value.message !== 'string') ||
    (value.hint !== undefined && typeof value.hint !== 'string')
  )
    return false
  if ('anyOf' in value) return Array.isArray(value.anyOf) && value.anyOf.every(check)
  if ('allOf' in value) return Array.isArray(value.allOf) && value.allOf.every(check)
  if ('not' in value) return check(value.not)
  switch (value.type) {
    case 'command':
      return (
        perOS(value.name) &&
        (value.args === undefined || strings(value.args)) &&
        (value.exitCode === undefined || typeof value.exitCode === 'number') &&
        (value.outputMatches === undefined || typeof value.outputMatches === 'string')
      )
    case 'file':
    case 'dir':
      return perOS(value.path)
    case 'process':
      return perOS(value.name)
    case 'env':
      return typeof value.name === 'string'
    case 'registry':
      return typeof value.key === 'string' && (value.value === undefined || typeof value.value === 'string')
    case 'http':
      return (
        typeof value.url === 'string' &&
        (value.status === undefined || typeof value.status === 'number') &&
        (value.timeoutMs === undefined || typeof value.timeoutMs === 'number')
      )
    case 'setting':
      return typeof value.key === 'string'
    default:
      return false
  }
}
const ref = (value: unknown): boolean => typeof value === 'string' || check(value)

/** Reject malformed package metadata before it reaches the host. */
export function readManifest(pkg: unknown): PluginManifest {
  if (!object(pkg) || typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || !object(pkg.macrotouch))
    throw new Error('Invalid plugin package: name, version and macrotouch are required')
  const m = pkg.macrotouch
  const fail = (field: string): never => {
    throw new Error(`Invalid plugin manifest: ${field}`)
  }
  if (typeof m.id !== 'string' || !/^[a-z0-9-]+$/.test(m.id)) fail('id')
  if (typeof m.label !== 'string') fail('label')
  if (typeof m.apiVersion !== 'number' || !Number.isFinite(m.apiVersion) || m.apiVersion > PLUGIN_API_VERSION)
    fail('apiVersion')
  for (const key of ['server', 'ui', 'icon']) if (m[key] !== undefined && typeof m[key] !== 'string') fail(key)
  if (m.platforms !== undefined && !platforms(m.platforms)) fail('platforms')
  for (const key of ['requires', 'ready'])
    if (m[key] !== undefined && (!Array.isArray(m[key]) || !(m[key] as unknown[]).every((v) => ref(v)))) fail(key)
  if (m.checks !== undefined && (!object(m.checks) || !Object.values(m.checks).every(check))) fail('checks')
  if (m.actions !== undefined) {
    if (!object(m.actions)) fail('actions')
    for (const action of Object.values(m.actions as Record<string, unknown>)) {
      if (!object(action)) return fail('actions')
      if (action.platforms !== undefined && !platforms(action.platforms)) fail('action platforms')
      for (const key of ['group', 'description', 'icon'])
        if (action[key] !== undefined && typeof action[key] !== 'string') fail(`action ${key}`)
      for (const key of ['requires', 'ready'])
        if (
          action[key] !== undefined &&
          (!Array.isArray(action[key]) || !(action[key] as unknown[]).every((v) => ref(v)))
        )
          fail(`action ${key}`)
    }
  }
  if (
    m.settings !== undefined &&
    (!Array.isArray(m.settings) ||
      !m.settings.every(
        (s: unknown) =>
          object(s) &&
          typeof s.key === 'string' &&
          typeof s.label === 'string' &&
          ['string', 'enum', 'boolean', 'number'].includes(s.type as string) &&
          (s.options === undefined || strings(s.options)) &&
          (s.secret === undefined || typeof s.secret === 'boolean') &&
          (s.required === undefined || typeof s.required === 'boolean'),
      ))
  )
    fail('settings')
  return { ...m, version: pkg.version } as unknown as PluginManifest
}
