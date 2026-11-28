import { spawn } from 'node:child_process'
import { ActionType, defineAction, type Parameters } from '../../plugin-sdk'

/** Pipe text into stdin, unshelled. */
function pipeTo(command: string, args: string[], text: string | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })
    child.once('error', reject)
    // Forked helpers hold stderr open.
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
    child.stdin?.end(text)
  })
}

const textOf = (parameters: Parameters): string => (typeof parameters?.text === 'string' ? parameters.text : '')

const action = defineAction({
  id: 'setClipboard',
  label: 'Set Clipboard',
  description: 'Put text on the clipboard.',
  icon: 'ic:baseline-content-paste',
  actionFields: [
    {
      key: 'text',
      label: 'Text',
      type: ActionType.String,
    },
  ],
  impl: {
    linux: (parameters) =>
      process.env.WAYLAND_DISPLAY
        ? pipeTo('wl-copy', [], textOf(parameters))
        : pipeTo('xclip', ['-selection', 'clipboard'], textOf(parameters)),
    darwin: (parameters) => pipeTo('pbcopy', [], textOf(parameters)),
    // UTF-16LE BOM keeps Unicode.
    win32: (parameters) => pipeTo('clip', [], Buffer.from(`\uFEFF${textOf(parameters)}`, 'utf16le')),
  },
})

export default action
