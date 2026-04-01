export interface NotificationPayload {
  title: string
  message: string
  appName?: string
}

export interface NotificationMessage extends NotificationPayload {
  type: 'notification'
}