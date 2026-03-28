import { ActionType, type Action } from '../../types/index'
import { getDefaultShell, getPlatform } from '../platform'
import { executeCommand } from './commandExecutor'

const options = ['PlayPause', 'NextTrack', 'PreviousTrack', 'Stop', 'VolumeUp', 'VolumeDown', 'Mute']

const action: Action = {
  actionId: 'multimediaControl',
  label: 'Multimedia Control',
  actionFields: [
    {
      key: 'control',
      label: 'Control',
      type: ActionType.Enum,
      options,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const control = parameters?.control
    if (!control || typeof control !== 'string') {
      console.warn('MultimediaControl.execute: missing or invalid control parameter')
      return
    }

    const platform = getPlatform()
    let command = ''

    const toLower = control.toLowerCase()

    if (platform === 'darwin') {
      switch (toLower) {
        case 'playpause':
          command = 'osascript -e \'tell application "Music" to playpause\''
          break
        case 'nexttrack':
          command = 'osascript -e \'tell application "Music" to next track\''
          break
        case 'previoustrack':
          command = 'osascript -e \'tell application "Music" to previous track\''
          break
        case 'stop':
          command = 'osascript -e \'tell application "Music" to stop\''
          break
        case 'volumeup':
          command = "osascript -e 'set volume output volume min(100, (output volume of (get volume settings)) + 5)'"
          break
        case 'volumedown':
          command = "osascript -e 'set volume output volume max(0, (output volume of (get volume settings)) - 5)'"
          break
        case 'mute':
          command = "osascript -e 'set volume output muted true'"
          break
        default:
          console.warn(`MultimediaControl.execute: unsupported control ${control}`)
          return
      }
    } else if (platform === 'linux') {
      switch (toLower) {
        case 'playpause':
          command = 'playerctl play-pause'
          break
        case 'nexttrack':
          command = 'playerctl next'
          break
        case 'previoustrack':
          command = 'playerctl previous'
          break
        case 'stop':
          command = 'playerctl stop'
          break
        case 'volumeup':
          command = 'pactl set-sink-volume @DEFAULT_SINK@ +5%'
          break
        case 'volumedown':
          command = 'pactl set-sink-volume @DEFAULT_SINK@ -5%'
          break
        case 'mute':
          command = 'pactl set-sink-mute @DEFAULT_SINK@ toggle'
          break
        default:
          console.warn(`MultimediaControl.execute: unsupported control ${control}`)
          return
      }
    } else if (platform === 'win32') {
      switch (toLower) {
        case 'playpause':
          command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]0xB3)"'
          break
        case 'nexttrack':
          command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]0xB0)"'
          break
        case 'previoustrack':
          command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]0xB1)"'
          break
        case 'stop':
          command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]0xB2)"'
          break
        case 'volumeup':
          command = 'nircmd.exe changesysvolume 6553'
          break
        case 'volumedown':
          command = 'nircmd.exe changesysvolume -6553'
          break
        case 'mute':
          command = 'nircmd.exe mutesysvolume 2'
          break
        default:
          console.warn(`MultimediaControl.execute: unsupported control ${control}`)
          return
      }
    } else {
      console.warn(`MultimediaControl.execute: unsupported platform ${platform}`)
      return
    }

    if (!command) {
      console.warn('MultimediaControl.execute: no command to execute')
      return
    }

    const tryCommands = async (commands: string[]) => {
      for (const cmd of commands) {
        try {
          await executeCommand(cmd)
          return true
        } catch (err) {
          // try next fallback
        }
      }
      return false
    }

    let commandsToTry = [command]

    if (platform === 'linux' && ['volumeup', 'volumedown', 'mute'].includes(toLower)) {
      // Add common Linux mixer fallback commands if pactl is missing.
      if (toLower === 'volumeup') {
        commandsToTry = [
          'pactl set-sink-volume @DEFAULT_SINK@ +5%',
          'amixer -D pulse sset Master 5%+',
          'amixer sset Master 5%+',
        ]
      } else if (toLower === 'volumedown') {
        commandsToTry = [
          'pactl set-sink-volume @DEFAULT_SINK@ -5%',
          'amixer -D pulse sset Master 5%-',
          'amixer sset Master 5%-',
        ]
      } else if (toLower === 'mute') {
        commandsToTry = [
          'pactl set-sink-mute @DEFAULT_SINK@ toggle',
          'amixer -D pulse sset Master toggle',
          'amixer sset Master toggle',
        ]
      }
    }

    try {
      const success = await tryCommands(commandsToTry)
      if (!success) {
        console.error('MultimediaControl.execute: none of the candidate commands succeeded', commandsToTry)
      }
      return
    } catch (err) {
      console.error('MultimediaControl.execute: failed to execute media command', err)
      return
    }
  },
}

export default action
