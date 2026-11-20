import { execFile } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { redactSecrets } from './redact'
import type { OSPlatform } from '../shared/platform'
import type { CheckRef, CheckSpec, PluginManifest } from '../shared/types/plugin'
import { errorText } from '../shared/errors'

export interface CheckEnv {
  manifest: PluginManifest
  platform: OSPlatform
  settings: Record<string, unknown>
  secrets: Record<string, string>
  dataDir: string
  status?: 'missing-dependency' | 'not-ready'
}
export type CheckOutcome =
  | { pass: true }
  | {
      pass: false
      status: 'missing-dependency' | 'not-ready' | 'not-configured'
      message: string
      hint?: string
    }
const pass: CheckOutcome = { pass: true }
const run = (file: string, args: string[], timeout = 5000): Promise<{ stdout: string; code: number | string | null }> =>
  new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout) =>
      resolve({ stdout, code: error ? (error.code ?? 1) : 0 }),
    )
  })

export async function evaluateCheck(ref: CheckRef, env: CheckEnv): Promise<CheckOutcome> {
  const fail = (
    message: string,
    hint?: string,
    status: 'missing-dependency' | 'not-ready' | 'not-configured' = env.status ?? 'missing-dependency',
  ): CheckOutcome => ({
    pass: false,
    status,
    message: redactSecrets(message, env.secrets),
    ...(hint ? { hint: redactSecrets(hint, env.secrets) } : {}),
  })
  try {
    const spec: CheckSpec | undefined = typeof ref === 'string' ? env.manifest.checks?.[ref] : ref
    if (!spec) return fail(`Unknown check: ${ref}`)
    const template = (s: string): string =>
      s.replace(/^~(?=$|[/\\])/, os.homedir()).replace(/\$\{([^}]+)\}/g, (_, key: string) => {
        if (key === 'home') return os.homedir()
        if (key === 'platform') return env.platform
        if (key === 'arch') return process.arch
        if (key === 'dataDir') return env.dataDir
        if (key.startsWith('env:')) return process.env[key.slice(4)] ?? ''
        if (key.startsWith('setting:')) return String(env.settings[key.slice(8)] ?? env.secrets[key.slice(8)] ?? '')
        return ''
      })
    const values = (v: unknown): string[] | undefined => {
      const selected =
        typeof v === 'object' && v !== null && !Array.isArray(v)
          ? ((v as Record<string, unknown>)[env.platform] ?? (v as Record<string, unknown>).default)
          : v
      if (selected === undefined) return undefined
      return (Array.isArray(selected) ? selected : [selected]).map((s) => template(String(s)))
    }
    const failure = (message: string, status?: 'not-configured') =>
      fail(spec.message ?? message, spec.hint, status ?? env.status ?? 'missing-dependency')
    if ('anyOf' in spec) {
      const results = await Promise.all(spec.anyOf.map((s) => evaluateCheck(s, env)))
      if (results.some((r) => r.pass)) return pass
      const first = results.find((r) => !r.pass)
      return failure(
        first && !first.pass ? first.message : 'No alternative passed',
        first && !first.pass && first.status === 'not-configured' ? 'not-configured' : undefined,
      )
    }
    if ('allOf' in spec) {
      for (const s of spec.allOf) {
        const result = await evaluateCheck(s, env)
        if (!result.pass)
          return spec.message
            ? failure(result.message, result.status === 'not-configured' ? 'not-configured' : undefined)
            : result
      }
      return pass
    }
    if ('not' in spec) return (await evaluateCheck(spec.not, env)).pass ? failure('Negated check passed') : pass
    if (spec.type === 'setting') {
      const isSet = (value: unknown) => value !== undefined && value !== null && value !== ''
      return isSet(env.settings[spec.key]) || isSet(env.secrets[spec.key])
        ? pass
        : failure(`Setting ${spec.key} is required`, 'not-configured')
    }
    if (spec.type === 'env')
      return process.env[template(spec.name)] ? pass : failure(`Environment variable ${spec.name} is not set`)
    if (spec.type === 'registry') {
      if (env.platform !== 'win32') return pass
      return (await run('reg', ['query', template(spec.key), ...(spec.value ? ['/v', template(spec.value)] : [])]))
        .code === 0
        ? pass
        : failure(`Registry key ${spec.key} was not found`)
    }
    if (spec.type === 'http') {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), spec.timeoutMs ?? 2000)
      try {
        const response = await fetch(template(spec.url), {
          signal: controller.signal,
        })
        return (spec.status === undefined ? response.ok : response.status === spec.status)
          ? pass
          : failure(`HTTP check failed: ${response.status}`)
      } finally {
        clearTimeout(timer)
      }
    }
    const candidates = values('path' in spec ? spec.path : spec.name)
    if (!candidates) return pass
    for (const candidate of candidates) {
      if (spec.type === 'file' || spec.type === 'dir') {
        try {
          const info = await stat(candidate)
          if (spec.type === 'file' ? true : info.isDirectory()) return pass
        } catch {
          /* Try another path. */
        }
      } else if (spec.type === 'process') {
        const result =
          env.platform === 'win32'
            ? await run('tasklist', ['/FI', `IMAGENAME eq ${candidate}`, '/NH'])
            : await run('pgrep', ['-x', candidate])
        if (
          result.code === 0 &&
          (env.platform !== 'win32' || result.stdout.toLowerCase().includes(candidate.toLowerCase()))
        )
          return pass
      } else if (spec.type === 'command') {
        const extensions = env.platform === 'win32' ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : ['']
        const paths = path.isAbsolute(candidate)
          ? [candidate]
          : (process.env.PATH ?? '')
              .split(path.delimiter)
              .flatMap((dir) =>
                extensions.map((ext) =>
                  path.join(dir || '.', candidate + (env.platform === 'win32' && !path.extname(candidate) ? ext : '')),
                ),
              )
        for (const executable of paths) {
          try {
            if (!(await stat(executable)).isFile()) continue
            await access(executable, env.platform === 'win32' ? constants.F_OK : constants.X_OK)
          } catch {
            continue
          }
          if (spec.args === undefined && spec.exitCode === undefined && spec.outputMatches === undefined) return pass
          const result = await run(executable, (spec.args ?? []).map(template))
          if (
            result.code === (spec.exitCode ?? 0) &&
            (spec.outputMatches === undefined || new RegExp(spec.outputMatches).test(result.stdout))
          )
            return pass
        }
      }
    }
    return failure(`${String('path' in spec ? spec.path : spec.name)} was not found`)
  } catch (error) {
    return fail(errorText(error))
  }
}
