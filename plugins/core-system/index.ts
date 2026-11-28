import { definePlugin } from '../../plugin-sdk'
import launchApp from './launchApp'
import shellCommand from './shellCommand'
import sendNotification from './sendNotification'
import openUrl from './openUrl'
import openPath from './openPath'
import setClipboard from './setClipboard'

export default definePlugin({ actions: [launchApp, shellCommand, sendNotification, openUrl, openPath, setClipboard] })
