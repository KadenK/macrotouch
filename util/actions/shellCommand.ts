import { BaseAction } from './baseAction'

export class ShellCommand extends BaseAction {
  constructor() {
    super('Shell Command', [
      {
        name: 'command',
        type: ActionType.String,
      },
    ])
  }

  protected execute(...args: any[]): void {
    // Implementation for executing shell command
  }

  protected validate(...args: any[]): boolean {
    // Implementation for validating shell command
    return true
  }
}
