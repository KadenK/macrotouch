import { ActionType, type Action } from '../../types/index'
import { getDefaultShell, getPlatform } from '../platform'
import { executeCommand } from './commandExecutor'

const action: Action = {
  actionId: 'shellCommand',
  label: 'Shell Command',
  actionFields: [
    {
      key: 'command',
      label: 'Command',
      type: ActionType.String,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const command = parameters?.command
    if (!command || typeof command !== 'string') {
      console.warn('ShellCommand.execute: missing or invalid command parameter')
      return
    }

    try {
      const currentPlatform = getPlatform()
      console.log('ShellCommand running on platform:', currentPlatform)
      await executeCommand(command)
    } catch (err) {
      console.error('ShellCommand.execute: failed to launch command', err)
    }
  },
}

export default action
