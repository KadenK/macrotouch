import { ActionType, type Action } from '../../types/index'
import { getDefaultShell, getPlatform } from '../platform'

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
      const shell = getDefaultShell()
      const { exec } = await import('node:child_process')
      exec(command, { shell }, (error, stdout, stderr) => {
        if (error) {
          console.error(`ShellCommand execution failed for command: ${command}`, error)
          return
        }
        if (stdout) console.log(`ShellCommand output: ${stdout}`)
        if (stderr) console.warn(`ShellCommand error output: ${stderr}`)
      })
    } catch (err) {
      console.error('ShellCommand.execute: failed to launch command', err)
    }
  },
}

export default action
