import { ActionType, defineAction, type ActionStateValue, type Parameters, type PluginContext } from '../../plugin-sdk'

const options = ['PlayPause', 'NextTrack', 'PreviousTrack', 'VolumeUp', 'VolumeDown', 'Mute']

/** Run each command in turn until one succeeds. Resolves with its stdout, or `null` if all failed. */
async function firstOutput(commands: string[], ctx: PluginContext): Promise<string | null> {
  for (const command of commands) {
    try {
      return await ctx.exec(command)
    } catch {
      // Tool missing or no audio server; try the next one.
    }
  }
  return null
}

/** Whether the default output is muted, or `null` when it can't be read (always on Windows). */
async function readMuted(_parameters: Parameters, ctx: PluginContext): Promise<ActionStateValue> {
  const platform = ctx.platform
  if (platform === 'linux') {
    // "Volume: 0.28" or "Volume: 0.28 [MUTED]"
    const wpctl = await firstOutput(['/usr/bin/wpctl get-volume @DEFAULT_AUDIO_SINK@'], ctx)
    if (wpctl !== null) return wpctl.includes('[MUTED]')
    // "Mute: yes" / "Mute: no"
    const pactl = await firstOutput(['/usr/bin/pactl get-sink-mute @DEFAULT_SINK@'], ctx)
    return pactl === null ? null : /yes/i.test(pactl)
  }
  if (platform === 'darwin') {
    const out = await firstOutput(["osascript -e 'output muted of (get volume settings)'"], ctx)
    return out === null ? null : out.trim() === 'true'
  }
  return null
}

/** Whether media is playing, or `null` when it can't be read (always on Windows). */
async function readPlaying(_parameters: Parameters, ctx: PluginContext): Promise<ActionStateValue> {
  const platform = ctx.platform
  if (platform === 'linux') {
    // "Playing" / "Paused" / "Stopped". With no player open, playerctl exits non-zero,
    // which means nothing is playing; only a missing playerctl means unknown.
    const out = await firstOutput(
      ['test -x /usr/bin/playerctl && (/usr/bin/playerctl status 2>/dev/null || echo Stopped)'],
      ctx,
    )
    return out === null ? null : out.trim() === 'Playing'
  }
  if (platform === 'darwin') {
    // The same players PlayPause controls, in the same order.
    const out = await firstOutput(
      [
        "osascript -e 'if application \"Music\" is running then' -e 'tell application \"Music\" to return (player state as string)' -e 'else if application \"Spotify\" is running then' -e 'tell application \"Spotify\" to return (player state as string)' -e 'else' -e 'return \"stopped\"' -e 'end if'",
      ],
      ctx,
    )
    return out === null ? null : out.trim() === 'playing'
  }
  return null
}

const action = defineAction({
  id: 'multimediaControl',
  label: 'Multimedia Control',
  description: 'Control media playback or volume.',
  icon: 'ic:baseline-play-circle',
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
  impl: {
    linux: (parameters, ctx) => execute(parameters, ctx, 'linux'),
    darwin: (parameters, ctx) => execute(parameters, ctx, 'darwin'),
    win32: (parameters, ctx) => execute(parameters, ctx, 'win32'),
  },
})

/** Windows virtual media keys. */
const windowsMediaKeys: Record<string, number> = {
  playpause: 0xb3,
  nexttrack: 0xb0,
  previoustrack: 0xb1,
  volumeup: 0xaf,
  volumedown: 0xae,
  mute: 0xad,
}

async function execute(
  parameters: Parameters,
  ctx: PluginContext,
  platform: 'linux' | 'darwin' | 'win32',
): Promise<void> {
  const control = parameters?.control
  if (!control || typeof control !== 'string') {
    throw new Error('Missing or invalid control parameter')
  }

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
        throw new Error(`Unsupported media control: ${control}`)
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
        throw new Error(`Unsupported media control: ${control}`)
    }
  } else if (platform === 'win32') {
    const key = windowsMediaKeys[toLower]
    if (key === undefined) throw new Error(`Unsupported media control: ${control}`)
    await ctx.spawn('powershell', [
      '-NoProfile',
      '-Command',
      `(New-Object -ComObject WScript.Shell).SendKeys([char]${key})`,
    ])
    return
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  if (!command) {
    throw new Error('No media command to execute')
  }

  const tryCommands = async (commands: string[]) => {
    for (const cmd of commands) {
      try {
        await ctx.exec(cmd)
        return true
      } catch {
        // Try the next command.
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

  const success = await tryCommands(commandsToTry)
  if (!success) throw new Error(`No media command succeeded for ${control}`)
}

export default action
