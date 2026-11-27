import { spawn } from 'node:child_process'
import type { PluginOS } from '../../plugin-sdk'

const OPENERS: Record<PluginOS, string> = {
  darwin: 'open',
  linux: 'xdg-open',
  win32: 'explorer.exe',
}

/** Open with the OS default handler. */
export function openWithSystem(target: string, platform: PluginOS): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(OPENERS[platform], [target], { shell: false, detached: true, stdio: 'ignore' })
    child.once('error', reject)
    // explorer.exe exit codes lie.
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
