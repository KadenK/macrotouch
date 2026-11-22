let enabled = false

export default {
  actions: [
    {
      id: 'hello',
      label: 'Say hello',
      icon: 'ic:baseline-chat',
      actionFields: [{ key: 'name', label: 'Name', type: 'string' }],
      execute: (parameters: { name?: string } | undefined, ctx: { log: { log(message: string): void } }) => {
        const name = parameters?.name?.trim() || 'world'
        ctx.log.log(`Hello, ${name}!`)
      },
    },
    {
      id: 'toggle',
      label: 'Toggle hello state',
      icon: 'ic:baseline-toggle-on',
      actionFields: [],
      execute: () => {
        enabled = !enabled
        return enabled
      },
      states: [
        {
          kind: 'toggle',
          valueLabels: { true: 'On', false: 'Off' },
          defaultIcons: {
            true: 'ic:baseline-toggle-on',
            false: 'ic:baseline-toggle-off',
          },
          get: () => enabled,
        },
      ],
    },
  ],
}
