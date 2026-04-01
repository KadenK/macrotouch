import type { Color } from './common'
import type { Macro } from './macro'
import type { MacroScreen } from './screen'

export interface MacroSettings {
  defaultScreenBgColor: Color
  defaultScreenSize: { rows: number; columns: number }
  swipeToChangeScreens: boolean
  attemptFullscreen: boolean
}

export interface MacroState {
  macros: Record<string, Macro>
  screens: Record<string, MacroScreen>
  settings?: MacroSettings
}
