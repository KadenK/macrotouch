import { ActionType, type Action } from '../../types/index'

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
      const notifierModule = (await import(/* @vite-ignore */ 'node-notifier')) as {
        default?: {
          notify: (
            options: { title: string; message: string; 'app-name'?: string },
            callback?: (error?: Error) => void,
          ) => void
        }
        notify?: (
          options: { title: string; message: string; 'app-name'?: string },
          callback?: (error?: Error) => void,
        ) => void
      }

      const notifier = notifierModule.default ?? notifierModule
      if (typeof notifier.notify !== 'function') {
        console.warn('SendNotification.execute: notification provider is unavailable')
        return
      }

      notifier.notify(
        {
          title,
          message,
          'app-name': appName,
        },
        (error) => {
          if (error) {
            console.error('SendNotification.execute: failed to show notification', error)
          }
        },
      )
    } catch (err) {
      console.error('SendNotification.execute: failed to show notification', err)
    }
  },
}

export default action
