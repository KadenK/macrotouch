import { ActionType, type Action } from '../../types/index'
import type { NotificationMessage } from '../../types'

type NotificationProcess = NodeJS.Process & {
  send?: (message: NotificationMessage) => boolean
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
    const title =
      typeof parameters?.title === 'string' && parameters.title.trim() ? parameters.title.trim() : 'MacroTouch'
    const message = typeof parameters?.message === 'string' ? parameters.message : ''
    const appName = 'MacroTouch'

    try {
      const childProcess = process as NotificationProcess
      if (typeof childProcess.send === 'function') {
        childProcess.send({
          type: 'notification',
          title,
          message,
          appName,
        })
        return
      }
      console.warn('SendNotification.execute: notification IPC is unavailable')
    } catch (err) {
      console.error('SendNotification.execute: failed to show notification', err)
    }
  },
}

export default action
