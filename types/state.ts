import type { Color } from './common'
import type { Macro } from './macro'
import type { MacroScreen } from './screen'

export interface MacroSettings {
  defaultScreenBgColor: Color
  defaultScreenSize: { rows: number; columns: number }
  swipeToChangeScreens: boolean
  attemptFullscreen: boolean
}

export function createDefaultSettings(): MacroSettings {
  return {
    defaultScreenBgColor: { r: 240, g: 240, b: 240 },
    defaultScreenSize: { rows: 3, columns: 5 },
    swipeToChangeScreens: true,
    attemptFullscreen: true,
  }
}

export interface MacroState {
  macros: Record<string, Macro>
  screens: Record<string, MacroScreen>
  settings?: MacroSettings
}
