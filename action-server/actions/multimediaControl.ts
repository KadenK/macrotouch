import { ActionType, type Action, type ActionStateValue } from '../../shared/types'
import { getPlatform } from '../../shared/platform'
import { executeCommand } from './commandExecutor'

const options = ['PlayPause', 'NextTrack', 'PreviousTrack', 'VolumeUp', 'VolumeDown', 'Mute']

/** Run each command in turn until one succeeds. Resolves with its stdout, or `null` if all failed. */
async function firstOutput(commands: string[]): Promise<string | null> {
  for (const command of commands) {
    try {
      return await executeCommand(command)
    } catch {
      // Tool missing or no audio server; try the next one.
    }
  }
  return null
}

/** Whether the default output is muted, or `null` when it can't be read (always on Windows). */
async function readMuted(): Promise<ActionStateValue> {
  const platform = getPlatform()
  if (platform === 'linux') {
    // "Volume: 0.28" or "Volume: 0.28 [MUTED]"
    const wpctl = await firstOutput(['/usr/bin/wpctl get-volume @DEFAULT_AUDIO_SINK@'])
    if (wpctl !== null) return wpctl.includes('[MUTED]')
    // "Mute: yes" / "Mute: no"
    const pactl = await firstOutput(['/usr/bin/pactl get-sink-mute @DEFAULT_SINK@'])
    return pactl === null ? null : /yes/i.test(pactl)
  }
  if (platform === 'darwin') {
    const out = await firstOutput(["osascript -e 'output muted of (get volume settings)'"])
    return out === null ? null : out.trim() === 'true'
  }
  return null
}

/** Whether media is playing, or `null` when it can't be read (always on Windows). */
async function readPlaying(): Promise<ActionStateValue> {
  const platform = getPlatform()
  if (platform === 'linux') {
    // "Playing" / "Paused" / "Stopped". With no player open, playerctl exits non-zero,
    // which means nothing is playing; only a missing playerctl means unknown.
    const out = await firstOutput([
      'test -x /usr/bin/playerctl && (/usr/bin/playerctl status 2>/dev/null || echo Stopped)',
    ])
    return out === null ? null : out.trim() === 'Playing'
  }
  if (platform === 'darwin') {
    // The same players PlayPause controls, in the same order.
    const out = await firstOutput([
      "osascript -e 'if application \"Music\" is running then' -e 'tell application \"Music\" to return (player state as string)' -e 'else if application \"Spotify\" is running then' -e 'tell application \"Spotify\" to return (player state as string)' -e 'else' -e 'return \"stopped\"' -e 'end if'",
    ])
    return out === null ? null : out.trim() === 'playing'
  }
  return null
}

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
  states: [
    {
      when: { control: 'Mute' },
      kind: 'toggle',
      valueLabels: { true: 'Muted', false: 'Unmuted' },
      defaultIcons: { true: 'ic:baseline-volume-off', false: 'ic:baseline-volume-up' },
      get: readMuted,
    },
    {
      when: { control: 'PlayPause' },
      kind: 'toggle',
      valueLabels: { true: 'Playing', false: 'Paused' },
      // Like a media player: while playing, the button offers pause.
      defaultIcons: { true: 'ic:baseline-pause', false: 'ic:baseline-play-arrow' },
      get: readPlaying,
    },
  ],
  async execute(parameters: Record<string, unknown>): Promise<void> {
    const control = parameters?.control
    if (!control || typeof control !== 'string') {
      console.warn('MultimediaControl.execute: missing or invalid control parameter')
      return
    }

    console.log(`MultimediaControl.execute: ${control}`)

    const platform = getPlatform()
    let command: string

    const toLower = control.toLowerCase()

    if (platform === 'darwin') {
      switch (toLower) {
        case 'playpause':
          command =
            "osascript -e 'if application \"Music\" is running then' -e 'tell application \"Music\" to playpause' -e 'else if application \"Spotify\" is running then' -e 'tell application \"Spotify\" to playpause' -e 'else' -e 'tell application \"System Events\" to key code 100' -e 'end if'"
          break
        case 'nexttrack':
          command =
            "osascript -e 'if application \"Music\" is running then' -e 'tell application \"Music\" to next track' -e 'else if application \"Spotify\" is running then' -e 'tell application \"Spotify\" to next track' -e 'else' -e 'tell application \"System Events\" to key code 101' -e 'end if'"
          break
        case 'previoustrack':
          command =
            "osascript -e 'if application \"Music\" is running then' -e 'tell application \"Music\" to previous track' -e 'else if application \"Spotify\" is running then' -e 'tell application \"Spotify\" to previous track' -e 'else' -e 'tell application \"System Events\" to key code 98' -e 'end if'"
          break
        case 'volumeup':
          command =
            "osascript -e 'set newVolume to output volume of (get volume settings) + 5' -e 'if newVolume > 100 then set newVolume to 100' -e 'set volume output volume newVolume'"
          break
        case 'volumedown':
          command =
            "osascript -e 'set newVolume to output volume of (get volume settings) - 5' -e 'if newVolume < 0 then set newVolume to 0' -e 'set volume output volume newVolume'"
          break
        case 'mute':
          command = "osascript -e 'set volume output muted (not (output muted of (get volume settings)))'"
          break
        default:
          console.warn(`MultimediaControl.execute: unsupported control ${control}`)
          return
      }
    } else if (platform === 'linux') {
      switch (toLower) {
        case 'playpause':
          command = '/usr/bin/playerctl play-pause'
          break
        case 'nexttrack':
          command = '/usr/bin/playerctl next'
          break
        case 'previoustrack':
          command = '/usr/bin/playerctl previous'
          break
        case 'volumeup':
          command = '/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ +5%'
          break
        case 'volumedown':
          command = '/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ -5%'
          break
        case 'mute':
          command = '/usr/bin/pactl set-sink-mute @DEFAULT_SINK@ toggle'
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
          const stderr =
            typeof err === 'object' && err && 'stderr' in err ? (err as { stderr?: string }).stderr : undefined
          console.warn('MultimediaControl.execute: command failed', cmd, stderr || err)
        }
      }
      return false
    }

    let commandsToTry = [command]

    if (platform === 'linux' && ['volumeup', 'volumedown', 'mute'].includes(toLower)) {
      // Prefer PipeWire's native controller, then fall back to PulseAudio/ALSA tools.
      if (toLower === 'volumeup') {
        commandsToTry = [
          '/usr/bin/wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+',
          '/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ +5%',
          '/usr/bin/amixer -D pulse sset Master 5%+',
          '/usr/bin/amixer sset Master 5%+',
        ]
      } else if (toLower === 'volumedown') {
        commandsToTry = [
          '/usr/bin/wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-',
          '/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ -5%',
          '/usr/bin/amixer -D pulse sset Master 5%-',
          '/usr/bin/amixer sset Master 5%-',
        ]
      } else if (toLower === 'mute') {
        commandsToTry = [
          '/usr/bin/wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle',
          '/usr/bin/pactl set-sink-mute @DEFAULT_SINK@ toggle',
          '/usr/bin/amixer -D pulse sset Master toggle',
          '/usr/bin/amixer sset Master toggle',
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
