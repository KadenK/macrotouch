import { ActionType, type Action } from '../../types/index'

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

const action: Action = {
  actionId: 'sendNotification',
  label: 'Send Notification',
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
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const title = typeof parameters?.title === 'string' && parameters.title.trim() ? parameters.title.trim() : APP_NAME
    const message = typeof parameters?.message === 'string' ? parameters.message : ''

    try {
      await notify(title, message)
    } catch (err) {
      console.error('SendNotification.execute: failed to show notification', err)
    }
  },
}

export default action
