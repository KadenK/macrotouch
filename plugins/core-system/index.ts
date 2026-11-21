import { definePlugin } from '../../plugin-sdk'
import launchApp from './launchApp'
import shellCommand from './shellCommand'
import sendNotification from './sendNotification'

export default definePlugin({ actions: [launchApp, shellCommand, sendNotification] })
