import { ActionType, defineAction } from '../../plugin-sdk'

const action = defineAction({
  id: 'shellCommand',
  label: 'Shell Command',
  description: 'Run a shell command.',
  icon: 'ic:baseline-terminal',
  actionFields: [
    {
      key: 'command',
      label: 'Command',
      type: ActionType.String,
    },
  ],
  async execute(parameters, ctx) {
    const command = parameters?.command
    if (!command || typeof command !== 'string') throw new Error('Missing or invalid command parameter')
    await ctx.exec(command)
  },
})

export default action
