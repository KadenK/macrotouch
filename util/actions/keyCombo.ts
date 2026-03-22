import { ActionType, type Action } from '../../types/index'

const macSpecialKeys: Record<string, number> = {
  enter: 36,
  return: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  delete: 117,
  escape: 53,
  esc: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
}

const windowsSpecialKeys: Record<string, string> = {
  enter: '{ENTER}',
  return: '{ENTER}',
  tab: '{TAB}',
  space: ' ',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  escape: '{ESC}',
  esc: '{ESC}',
  left: '{LEFT}',
  right: '{RIGHT}',
  down: '{DOWN}',
  up: '{UP}',
}

const linuxSpecialKeys: Record<string, string> = {
  enter: 'Return',
  return: 'Return',
  tab: 'Tab',
  space: 'space',
  backspace: 'BackSpace',
  delete: 'Delete',
  escape: 'Escape',
  esc: 'Escape',
  left: 'Left',
  right: 'Right',
  down: 'Down',
  up: 'Up',
}

const modifierAliases: Record<string, string> = {
  ctrl: 'control',
  control: 'control',
  cmd: 'command',
  command: 'command',
  meta: 'command',
  win: 'command',
  windows: 'command',
  option: 'option',
  alt: 'option',
  shift: 'shift',
}

const normalizeToken = (token: string) => token.trim().toLowerCase().replace(/\s+/g, '')

const splitCombo = (combo: string) =>
  combo
    .split(/[+\s]+/)
    .map(normalizeToken)
    .filter(Boolean)

const escapeAppleScriptText = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildAppleScript = (modifiers: string[], key: string) => {
  const modifierList = modifiers
    .map((modifier) => {
      if (modifier === 'control') return 'control down'
      if (modifier === 'option') return 'option down'
      if (modifier === 'shift') return 'shift down'
      if (modifier === 'command') return 'command down'
      return undefined
    })
    .filter(Boolean)

  const scriptModifiers = modifierList.length > 0 ? ` using {${modifierList.join(', ')}}` : ''
  const specialKeyCode = macSpecialKeys[key]
  if (specialKeyCode) {
    return `tell application "System Events" to key code ${specialKeyCode}${scriptModifiers}`
  }

  return `tell application "System Events" to keystroke "${escapeAppleScriptText(key)}"${scriptModifiers}`
}

const buildWindowsSequence = (modifiers: string[], key: string) => {
  const modifierTokens = modifiers
    .map((modifier) => {
      if (modifier === 'control') return '^'
      if (modifier === 'shift') return '+'
      if (modifier === 'option') return '%'
      if (modifier === 'command') return '#'
      return ''
    })
    .join('')

  const specialKey = windowsSpecialKeys[key]
  if (specialKey) {
    return `${modifierTokens}${specialKey}`
  }

  if (key.length === 1) {
    return `${modifierTokens}${key}`
  }

  return `${modifierTokens}{${key.toUpperCase()}}`
}

const buildLinuxSequence = (modifiers: string[], key: string) => {
  const modifierTokens = modifiers
    .map((modifier) => {
      if (modifier === 'control') return 'ctrl'
      if (modifier === 'shift') return 'shift'
      if (modifier === 'option') return 'alt'
      if (modifier === 'command') return 'super'
      return ''
    })
    .filter(Boolean)

  const specialKey = linuxSpecialKeys[key]
  const keyToken = specialKey || (key.length === 1 ? key : key)
  return [...modifierTokens, keyToken].join('+')
}

const action: Action = {
  actionId: 'keyCombo',
  label: 'Key Combo',
  actionFields: [
    {
      key: 'keys',
      label: 'Keys',
      type: ActionType.String,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const rawKeys = parameters?.keys
    if (!rawKeys || typeof rawKeys !== 'string') {
      console.warn('KeyCombo.execute: missing or invalid keys parameter')
      return
    }

    const tokens = splitCombo(rawKeys)
    const key = tokens.pop()
    if (!key) {
      console.warn('KeyCombo.execute: no key provided')
      return
    }

    const modifiers = tokens.map((token) => modifierAliases[token] || token)

    try {
      const { execFile } = await import('node:child_process')

      if (process.platform === 'darwin') {
        const script = buildAppleScript(modifiers, key)
        execFile('osascript', ['-e', script], (error, stdout, stderr) => {
          if (error) {
            console.error('KeyCombo.execute failed on macOS', error)
            return
          }
          if (stdout) console.log(`KeyCombo output: ${stdout}`)
          if (stderr) console.warn(`KeyCombo error output: ${stderr}`)
        })
        return
      }

      if (process.platform === 'win32') {
        const sequence = buildWindowsSequence(modifiers, key)
        const command = `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('${sequence.replace(/'/g, "''")}')`
        execFile('powershell', ['-NoProfile', '-Command', command], (error, stdout, stderr) => {
          if (error) {
            console.error('KeyCombo.execute failed on Windows', error)
            return
          }
          if (stdout) console.log(`KeyCombo output: ${stdout}`)
          if (stderr) console.warn(`KeyCombo error output: ${stderr}`)
        })
        return
      }

      const sequence = buildLinuxSequence(modifiers, key)
      execFile('xdotool', ['key', '--clearmodifiers', sequence], (error, stdout, stderr) => {
        if (error) {
          console.error('KeyCombo.execute failed on Linux', error)
          return
        }
        if (stdout) console.log(`KeyCombo output: ${stdout}`)
        if (stderr) console.warn(`KeyCombo error output: ${stderr}`)
      })
    } catch (err) {
      console.error('KeyCombo.execute: failed to launch key combo', err)
    }
  },
}

export default action
