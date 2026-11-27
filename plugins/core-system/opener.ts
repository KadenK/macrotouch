import { spawn } from 'node:child_process'
import path from 'node:path'
import type { PluginOS } from '../../plugin-sdk'

const OPENERS: Record<PluginOS, string> = {
  darwin: 'open',
  linux: 'xdg-open',
  win32: 'explorer.exe',
}

function launch(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, detached: true, stdio: 'ignore' })
    child.once('error', reject)
    // explorer.exe exit codes lie.
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

/** Open with default handler. */
export function openWithSystem(target: string, platform: PluginOS): Promise<void> {
  // explorer.exe misreads forward slashes.
  const arg = platform === 'win32' ? path.win32.normalize(target) : target
  return launch(OPENERS[platform], [arg])
}

/** Open in default browser. */
export function openUrlWithSystem(url: string, platform: PluginOS): Promise<void> {
  // explorer.exe opens Documents instead.
  if (platform === 'win32') return launch('rundll32.exe', ['url.dll,FileProtocolHandler', url])
  return launch(OPENERS[platform], [url])
}
