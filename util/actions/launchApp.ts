import { ActionType, type Action } from '../../types/index'
import { executeSpawn } from './commandExecutor'

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
    const args = typeof parameters?.args === 'string' ? parameters.args : ''

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
          await executeSpawn(`start "" "${target}" ${args}`.trim())
        } else if (process.platform === 'darwin') {
          await executeSpawn(`open "${target}" ${args}`.trim())
        } else {
          await executeSpawn(`xdg-open "${target}" ${args}`.trim())
        }
        return
      }

      // Handle macOS .app bundles
      if (process.platform === 'darwin' && target.endsWith('.app')) {
        await executeSpawn(`open -a "${target}" ${args}`.trim())
        return
      }

      // Handle Windows executables
      if (process.platform === 'win32') {
        await executeSpawn(`start "" "${target}" ${args}`.trim())
        return
      }

      // Handle Linux / macOS raw binaries
      await executeSpawn(`${target} ${args}`.trim())
      return
    } catch (err) {
      console.error('LaunchApp.execute: failed to launch application', err)
    }
  },
}

export default action
