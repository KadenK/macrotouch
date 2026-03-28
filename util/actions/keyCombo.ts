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

const ydotoolKeyCodes: Record<string, number> = {
  // modifiers
  control: 29,
  shift: 42,
  alt: 56,
  command: 125,

  // letters
  a: 30,
  b: 48,
  c: 46,
  d: 32,
  e: 18,
  f: 33,
  g: 34,
  h: 35,
  i: 23,
  j: 36,
  k: 37,
  l: 38,
  m: 50,
  n: 49,
  o: 24,
  p: 25,
  q: 16,
  r: 19,
  s: 31,
  t: 20,
  u: 22,
  v: 47,
  w: 17,
  x: 45,
  y: 21,
  z: 44,

  // digits
  '1': 2,
  '2': 3,
  '3': 4,
  '4': 5,
  '5': 6,
  '6': 7,
  '7': 8,
  '8': 9,
  '9': 10,
  '0': 11,

  // special keys
  enter: 28,
  return: 28,
  tab: 15,
  space: 57,
  backspace: 14,
  delete: 111,
  escape: 1,
  esc: 1,
  left: 105,
  right: 106,
  down: 108,
  up: 103,
  home: 102,
  end: 107,
  pageup: 104,
  pagedown: 109,
  insert: 110,

  // function keys
  f1: 59,
  f2: 60,
  f3: 61,
  f4: 62,
  f5: 63,
  f6: 64,
  f7: 65,
  f8: 66,
  f9: 67,
  f10: 68,
  f11: 87,
  f12: 88,
}

const buildYdotoolSequence = (modifiers: string[], key: string): string[] => {
  const sequence: string[] = []
  const uniqueModifiers = [...new Set(modifiers)]

  const getKeyCode = (token: string): number | undefined => {
    const normalized = token.toLowerCase()
    return ydotoolKeyCodes[normalized]
  }

  for (const modifier of uniqueModifiers) {
    const code = getKeyCode(modifier)
    if (code !== undefined) {
      sequence.push(`${code}:1`)
    }
  }

  const keyCode = getKeyCode(key)
  if (keyCode === undefined) {
    return []
  }

  sequence.push(`${keyCode}:1`, `${keyCode}:0`)

  for (const modifier of [...uniqueModifiers].reverse()) {
    const code = getKeyCode(modifier)
    if (code !== undefined) {
      sequence.push(`${code}:0`)
    }
  }

  return sequence
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
      type: ActionType.KeyCombo,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    console.log('Executing KeyCombo with parameters:', parameters)
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
      const { executeCommand, executeSpawn } = await import('./commandExecutor')

      if (process.platform === 'darwin') {
        const script = buildAppleScript(modifiers, key)
        await executeCommand(`osascript -e "${script.replace(/\"/g, '\\\"')}"`)
        return
      }

      if (process.platform === 'win32') {
        const sequence = buildWindowsSequence(modifiers, key)
        const command = `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('${sequence.replace(/'/g, "''")}')`
        await executeCommand(`powershell -NoProfile -Command "${command.replace(/\"/g, '\\\"')}"`)
        return
      }

      const sequence = buildLinuxSequence(modifiers, key)
      const ydotoolSeq = buildYdotoolSequence(modifiers, key)

      const runLinuxKeys = async (command: string, args: string[]) => {
        console.log('KeyCombo.execute: running', command, args.join(' '))
        await executeSpawn(command, args)
      }

      try {
        await runLinuxKeys('xdotool', ['key', '--clearmodifiers', sequence])
        console.log('KeyCombo.execute: xdotool succeeded')
      } catch (firstError: unknown) {
        const errObj = firstError as { error?: { code?: string } } | null
        const xdotoolNotFound =
          typeof firstError === 'object' &&
          firstError !== null &&
          'error' in (firstError as Record<string, unknown>) &&
          errObj?.error?.code === 'ENOENT'

        const ydotoolArgs = ydotoolSeq.length ? ['key', ...ydotoolSeq] : []

        if (xdotoolNotFound) {
          console.warn('KeyCombo.execute: xdotool not installed, trying ydotool fallback')
        } else {
          console.warn('KeyCombo.execute: xdotool failed, trying ydotool fallback if available', firstError)
        }

        if (!ydotoolArgs.length) {
          console.error('KeyCombo.execute failed: cannot build ydotool key sequence from', rawKeys)
        } else {
          try {
            await runLinuxKeys('ydotool', ydotoolArgs)
          } catch (secondError: unknown) {
            console.error('KeyCombo.execute failed on Linux (ydotool path)', secondError)
            console.error('Original xdotool error:', firstError)
          }
        }
      }
    } catch (err: unknown) {
      console.error('KeyCombo.execute: failed to launch key combo', err)
    }
  },
}

export default action
