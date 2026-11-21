import { exec as execChild, spawn as spawnChild, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { getDefaultShell, getPlatform } from '../shared/platform'
import type { PluginContext } from '../plugin-sdk'
import { inspect } from 'node:util'
import { redactSecrets } from './redact'
import type { PluginManifest } from '../shared/types/plugin'

/** Buffer a child's output; resolve with stdout on exit code 0, else reject with it attached. */
function collectOutput(child: ChildProcess, resolve: (stdout: string) => void, reject: (error: unknown) => void): void {
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (data) => {
    stdout += data.toString()
  })
  child.stderr?.on('data', (data) => {
    stderr += data.toString()
  })
  child.on('error', (error) => reject(Object.assign(error, { stdout, stderr })))
  child.on('close', (code) => {
    if (code === 0) resolve(stdout)
    else
      reject(
        Object.assign(new Error(`Command exited with code ${code}`), {
          code,
          stdout,
          stderr,
        }),
      )
  })
}

export function createContext(manifest: PluginManifest, dataRoot: string): PluginContext {
  const prefix = `[plugin:${manifest.id}]`
  const dataDir = path.join(dataRoot, 'plugin-data', manifest.id)
  const secrets: Record<string, string> = {}
  const safe = (args: unknown[]) =>
    args.map((arg) => redactSecrets(typeof arg === 'string' ? arg : inspect(arg), secrets))
  return {
    pluginId: manifest.id,
    platform: getPlatform(),
    settings: {},
    secrets,
    dataDir,
    log: {
      log: (...args) => console.log(prefix, ...safe(args)),
      warn: (...args) => console.warn(prefix, ...safe(args)),
      error: (...args) => console.error(prefix, ...safe(args)),
    },
    exec: (command) =>
      new Promise((resolve, reject) => {
        execChild(command, { shell: getDefaultShell() }, (error, stdout, stderr) => {
          if (error) reject(Object.assign(error, { stdout, stderr }))
          else resolve(stdout)
        })
      }),
    spawn: (command, args) =>
      new Promise((resolve, reject) => {
        collectOutput(spawnChild(command, args, { shell: false }), resolve, reject)
      }),
  }
}

/** Give one run its own child processes. */
export function createRunContext(ctx: PluginContext, signal: AbortSignal): PluginContext {
  const track = (child: ChildProcess) => {
    const kill = () => {
      if (child.pid && process.platform === 'win32') {
        const killer = spawnChild('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
        killer.on('error', () => child.kill('SIGKILL'))
        return
      }
      if (child.pid && process.platform !== 'win32') {
        try {
          process.kill(-child.pid, 'SIGKILL')
          return
        } catch {
          // The process may have already exited.
        }
      }
      child.kill('SIGKILL')
    }
    signal.addEventListener('abort', kill, { once: true })
    child.once('close', () => signal.removeEventListener('abort', kill))
    if (signal.aborted) kill()
  }
  const runContext: PluginContext = {
    ...ctx,
    exec: (command) => runContext.spawn(getDefaultShell(), [process.platform === 'win32' ? '/c' : '-c', command]),
    spawn: (command, args) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error('Action timed out'))
        const child = spawnChild(command, args, {
          shell: false,
          detached: process.platform !== 'win32',
        })
        track(child)
        collectOutput(child, resolve, reject)
      }),
  }
  return runContext
}
