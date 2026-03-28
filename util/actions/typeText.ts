import { ActionType, type Action } from '../../types/index'
import { executeCommand } from './commandExecutor'

const escapeAppleScriptText = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

const escapeWindowsSendKeys = (text: string) => {
  // SendKeys interprets braces; double them for literals.
  return text
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}')
    .replace(/\^/g, '^^')
    .replace(/%/g, '%%')
    .replace(/~/g, '{~}')
    .replace(/\+/g, '{+}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}')
}

const action: Action = {
  actionId: 'typeText',
  label: 'Type Text',
  actionFields: [
    {
      key: 'text',
      label: 'Text',
      type: ActionType.String,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const text = parameters?.text
    if (!text || typeof text !== 'string') {
      console.warn('TypeText.execute: missing or invalid text parameter')
      return
    }

    try {
      if (process.platform === 'darwin') {
        const script = `tell application "System Events" to keystroke "${escapeAppleScriptText(text)}"`
        await executeCommand(`osascript -e "${script.replace(/\"/g, '\\\"')}"`)
        return
      }

      if (process.platform === 'win32') {
        const sequence = escapeWindowsSendKeys(text)
        const command = `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('${sequence.replace(/'/g, "''")}')`
        await executeCommand(`powershell -NoProfile -Command "${command.replace(/\"/g, '\\\"')}"`)
        return
      }

      if (process.platform === 'linux') {
        try {
          await executeCommand(`xdotool type --clearmodifiers "${text.replace(/"/g, '\\"')}"`)
          return
        } catch (error) {
          console.warn('TypeText.execute xdotool failed, trying ydotool fallback', error)
          try {
            await executeCommand(`ydotool type "${text.replace(/"/g, '\\"')}"`)
            return
          } catch (err2) {
            console.error('TypeText.execute failed on Linux', err2)
            return
          }
        }
      }

      console.warn('TypeText.execute: Unsupported platform', process.platform)
    } catch (err) {
      console.error('TypeText.execute: failed to type text', err)
    }
  },
}

export default action
