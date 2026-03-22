import { ActionType, type Action } from '../../types/index'

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

      const { spawn } = await import('node:child_process')

      if (process.platform === 'darwin' && target.endsWith('.app')) {
        const child = spawn('open', ['-a', target, ...(args.length > 0 ? ['--args', ...args] : [])], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        return
      }

      const child = spawn(target, args, {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      })
      child.unref()
    } catch (err) {
      console.error('LaunchApp.execute: failed to launch application', err)
    }
  },
}

export default action
