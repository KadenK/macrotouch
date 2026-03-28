import { ActionType, type Action } from '../../types/index'
import { executeSpawn } from './commandExecutor'

const parseArguments = (value: unknown): string[] => {
  if (!value || typeof value !== 'string') return []

  const args: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    const arg = match[1] ?? match[2] ?? match[3]
    if (arg) {
      args.push(arg)
    }
  }

  return args
}

const isUrl = (value: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(value)

const action: Action = {
  actionId: 'launchApp',
  label: 'Launch App',
  actionFields: [
    {
      key: 'app',
      label: 'App',
      type: ActionType.ExecutablePath,
    },
    {
      key: 'args',
      label: 'Arguments',
      type: ActionType.String,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const target = parameters?.app
    const args = parseArguments(parameters?.args)

    if (!target || typeof target !== 'string') {
      console.warn('LaunchApp.execute: missing or invalid app parameter')
      return
    }

    try {
      if (isUrl(target)) {
        const { shell } = await import('electron')
        await shell.openExternal(target)
        return
      }

      if (process.platform === 'darwin' && target.endsWith('.app')) {
        const appCommand = `open -a "${target}" ${args.length > 0 ? `--args ${args.map((a) => `"${a}"`).join(' ')}` : ''}`
        await executeSpawn(appCommand)
        return
      }

      try {
        // For regular executables, spawn directly to preserve detached semantics
        const { spawn } = await import('node:child_process')
        const child = spawn(target, args, {
          detached: true,
          stdio: 'ignore',
          shell: process.platform === 'win32',
        })
        child.unref()
        return
      } catch (spawnError) {
        // Fallback to commandExecutor for shell execution path
        const wrapped = `${target} ${args.map((a) => `"${a}"`).join(' ')}`.trim()
        await executeSpawn(wrapped)
        return
      }
    } catch (err) {
      console.error('LaunchApp.execute: failed to launch application', err)
    }
  },
}

export default action
