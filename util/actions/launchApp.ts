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
      // Handle URLs
      if (isUrl(target)) {
        try {
          const electron = await import('electron')
          if (electron?.shell?.openExternal) {
            await electron.shell.openExternal(target)
            return
          }
        } catch {
          // electron not available in this context, fall through to platform command
        }
        if (process.platform === 'win32') {
          await executeSpawn(`start "" "${target}"`)
        } else if (process.platform === 'darwin') {
          await executeSpawn(`open "${target}"`)
        } else {
          await executeSpawn(`xdg-open "${target}"`)
        }
        return
      }

      // Handle macOS .app bundles
      if (process.platform === 'darwin' && target.endsWith('.app')) {
        const appCommand = `open -a "${target}" ${args.length > 0 ? `--args ${args.map((a) => `"${a}"`).join(' ')}` : ''}`
        await executeSpawn(appCommand)
        return
      }

      // Handle Windows executables
      if (process.platform === 'win32') {
        const quotedTarget = `"${target}"`
        const argsStr = args.length > 0 ? ` ${args.map((a) => `"${a}"`).join(' ')}` : ''
        const appCommand = `start "" ${quotedTarget}${argsStr}`
        await executeSpawn(appCommand)
        return
      }

      // Handle Linux / macOS raw binaries
      try {
        const { spawn } = await import('node:child_process')
        const child = spawn(target, args, {
          detached: true,
          stdio: 'ignore',
          shell: false,
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
