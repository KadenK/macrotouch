import { ActionType, type Action } from '../../types/index'
import type { NotificationMessage, NotificationPayload } from '../../types'

type NotificationProcess = NodeJS.Process & {
  send?: (message: NotificationMessage) => boolean
}

const DEFAULT_NOTIFICATION_URL = 'http://127.0.0.1:4323/notify'
const notificationServerUrl = process.env.NOTIFICATION_SERVER_URL ?? DEFAULT_NOTIFICATION_URL

async function sendFallbackNotification(payload: NotificationPayload): Promise<void> {
  const response = await fetch(notificationServerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Notification server responded ${response.status}: ${text}`)
  }
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

    const childProcess = process as NotificationProcess
    if (typeof childProcess.send === 'function') {
      try {
        childProcess.send({
          type: 'notification',
          title,
          message,
          appName,
        })
        return
      } catch (err) {
        console.error('SendNotification.execute: failed to send notification via IPC', err)
      }
    }

    try {
      await sendFallbackNotification({ title, message, appName })
    } catch (err) {
      console.warn('SendNotification.execute: notification IPC is unavailable, fallback failed', err)
    }
  },
}

export default action
