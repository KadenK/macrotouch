import { ActionType, defineAction, type Parameters } from '../../plugin-sdk'

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

const getText = (parameters: Parameters): string => {
  const text = parameters?.text
  if (!text || typeof text !== 'string') throw new Error('Missing or invalid text parameter')
  return text
}

const action = defineAction({
  id: 'typeText',
  label: 'Type Text',
  description: 'Type the specified text.',
  icon: 'ic:baseline-text-fields',
  actionFields: [
    {
      key: 'text',
      label: 'Text',
      type: ActionType.String,
    },
  ],
  impl: {
    darwin: async (parameters, ctx) => {
      const text = getText(parameters)
      const script = `tell application "System Events" to keystroke "${escapeAppleScriptText(text)}"`
      await ctx.spawn('osascript', ['-e', script])
    },
    win32: async (parameters, ctx) => {
      const sequence = escapeWindowsSendKeys(getText(parameters))
      const command = `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('${sequence.replace(/'/g, "''")}')`
      await ctx.spawn('powershell', ['-NoProfile', '-Command', command])
    },
    linux: async (parameters, ctx) => {
      const text = getText(parameters)
      try {
        await ctx.spawn('xdotool', ['type', '--clearmodifiers', text])
      } catch {
        try {
          await ctx.spawn('ydotool', ['type', text])
        } catch {
          throw new Error('Neither xdotool nor ydotool could type the text')
        }
      }
    },
  },
})

export default action
