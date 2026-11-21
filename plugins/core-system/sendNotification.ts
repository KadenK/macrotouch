import { ActionType, defineAction } from '../../plugin-sdk'

const APP_NAME = 'MacroTouch'

async function notify(title: string, message: string): Promise<void> {
  const { default: notifier } = await import('node-notifier')
  return new Promise((resolve, reject) => {
    notifier.notify({ title, message, appID: APP_NAME }, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

const action = defineAction({
  id: 'sendNotification',
  label: 'Send Notification',
  description: 'Show a desktop notification.',
  icon: 'ic:baseline-notifications',
  actionFields: [
    {
      key: 'title',
      label: 'Title',
      type: ActionType.String,
    },
    {
      key: 'message',
      label: 'Message',
      type: ActionType.String,
    },
  ],
  async execute(parameters): Promise<void> {
    const title = typeof parameters?.title === 'string' && parameters.title.trim() ? parameters.title.trim() : APP_NAME
    const message = typeof parameters?.message === 'string' ? parameters.message : ''

    await notify(title, message)
  },
})

export default action
